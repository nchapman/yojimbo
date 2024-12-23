import {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { Tool, DefaultToolInput, JSONSchema } from "../tools/tool";

export interface AgentConfig {
  role: string;
  goal?: string | null;
  backstory?: string | null;
  parameters?: JSONSchema<DefaultToolInput>;
  llm: LLMCompletion;
  tools?: Tool[] | null;
  maxIter?: number | null;
  verbose?: boolean | null;
}

export class Agent extends Tool {
  public role: string;
  public goal: string | null;
  public backstory: string | null;
  public llm: LLMCompletion;
  public tools: Tool[];
  public maxIter: number;
  public verbose: boolean;

  constructor(config: AgentConfig) {
    super(config.role, config.goal ?? "", config.parameters);
    this.role = config.role;
    this.goal = config.goal ?? null;
    this.backstory = config.backstory ?? null;
    this.llm = config.llm;
    this.tools = config.tools ?? [];
    this.maxIter = config.maxIter ?? Math.max(this.tools.length, 5);
    this.verbose = config.verbose ?? false;
  }

  async execute(args: DefaultToolInput): Promise<string> {
    console.log("🤖 Starting agent execution...");
    const systemPrompt = `You are a helpful AI agent. You will act in the role provided by the user and provide a helpful answer to the input.`;
    const prompt = this.getPrompt(args);

    console.log("📝 System Prompt:", systemPrompt);
    console.log("💭 Prompt:", prompt);

    const tools = this.tools.map((tool) => tool.toSchema());

    console.log("🔧 Tools:", tools);

    console.log("📤 Sending initial request to LLM...");
    const response = await this.llm({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      tools,
    });

    // Handle tool calls if present
    if (response.choices[0]?.message?.tool_calls) {
      const toolCalls = response.choices[0].message.tool_calls;
      {
        console.log(
          "🔧 Tool calls detected:",
          toolCalls.map((t) => `${t.function.name}(${t.function.arguments})`)
        );
      }

      const toolResults = await Promise.all(
        toolCalls.map(async (toolCall) => {
          const tool = this.tools.find(
            (t) => t.func_name === toolCall.function.name
          );
          if (!tool) {
            throw new Error(`Tool ${toolCall.function.name} not found`);
          }
          console.log(`⚙️ Executing tool: ${toolCall.function.name}`);
          const args = JSON.parse(toolCall.function.arguments);
          const result = await tool.execute(args);
          console.log(`🔧 Tool result:`, result);
          return result;
        })
      );

      console.log("📤 Sending final request to LLM with tool results...");
      // Get final response with tool results
      const finalResponse = await this.llm({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
          {
            role: "assistant",
            content: response.choices[0].message.content ?? "",
            tool_calls: toolCalls,
          },
          ...toolResults.map((result, index) => ({
            role: "tool" as const,
            content: JSON.stringify(result),
            tool_call_id: toolCalls[index].id,
          })),
        ],
        tools,
      });

      console.log("✅ Agent execution completed with tool usage");
      return (
        finalResponse.choices[0]?.message?.content ?? "No response generated"
      );
    }

    console.log("✅ Agent execution completed without tool usage");
    return response.choices[0]?.message?.content ?? "No response generated";
  }

  private getPrompt(args: DefaultToolInput): string {
    const lines = [];

    lines.push(`Your role: ${this.role}`);

    if (this.goal) {
      lines.push(`Your goal: ${this.goal}`);
    }

    if (this.backstory) {
      lines.push(`Your backstory: ${this.backstory}`);
    }

    if (this.tools.length > 0) {
      lines.push(`You can use these tools:`);
      this.tools.forEach((tool) => {
        lines.push(`- ${tool.name}: ${tool.description}`);
      });
    }

    lines.push(`Provided input: ${JSON.stringify(args)}`);
    lines.push(`Respond with a helpful answer.`);

    return lines.join("\n");
  }
}

export type LLMCompletion = (params: {
  messages: ChatCompletionMessageParam[];
  tools: ChatCompletionTool[];
}) => Promise<ChatCompletion>;
