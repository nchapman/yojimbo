import {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";
import { Tool, DefaultToolInput, JSONSchema } from "../tools/tool";

export interface AgentConfig {
  role: string;
  goal?: string | null;
  backstory?: string | null;
  parameters?: JSONSchema<DefaultToolInput>;
  llm?: LLMCompletion;
  tools?: Tool[] | null;
  maxIter?: number | null;
  verbose?: boolean | null;
}

export class Agent extends Tool {
  public role: string;
  public goal: string | null;
  public backstory: string | null;
  public llm?: LLMCompletion;
  public tools: Tool[];
  public maxIter: number;
  public verbose: boolean;
  protected systemPrompt: string;

  constructor(config: AgentConfig) {
    super(config.role, config.goal ?? "", config.parameters);
    this.role = config.role;
    this.goal = config.goal ?? null;
    this.backstory = config.backstory ?? null;
    this.llm = config.llm;
    this.tools = config.tools ?? [];
    this.maxIter = config.maxIter ?? Math.max(this.tools.length, 5);
    this.verbose = config.verbose ?? false;
    this.funcName = this.getFuncName("Agent");
    this.systemPrompt = this.trimBlock(`
      You are a helpful AI agent. The user does not see any of these messages except the last one.
      Only provide the response as requested. Do not include any intros, outros, labels, or quotes around the answer.
      You must adhere to the provided role and goal.
    `);
  }

  async execute(args: DefaultToolInput): Promise<string> {
    if (!this.llm) {
      throw new Error(
        "LLM not configured. Please set the llm property before executing the agent."
      );
    }

    console.log("🤖 Starting agent execution...");
    const prompt = this.getPrompt(args);

    console.log("📝 System Prompt:", this.systemPrompt);
    console.log("💭 Prompt:", prompt);

    let messages: ChatCompletionMessageParam[] = [
      { role: "system", content: this.systemPrompt },
      { role: "user", content: prompt },
    ];
    const tools = this.getToolSchemas();

    console.log("🔧 Tools:", tools);

    let i = 0;
    while (i < this.maxIter) {
      console.log(`📤 Sending request to LLM (iteration ${i + 1})...`);

      const response = await this.llm({ messages, tools });
      const message = response.choices[0]?.message;

      // Return the response if no tool calls are detected
      if (!message?.tool_calls) {
        console.log("✅ Agent execution completed without tool usage");
        return message?.content ?? "No response generated";
      }

      const newMessages = await this.handleToolCalls(message);
      messages.push(...newMessages);
      i++;
    }

    console.log("⚠️ Max iterations reached");
    return "Max iterations reached without final response";
  }

  public getToolSchemas() {
    const toolSchemas = this.tools.map((tool) => tool.toSchema());

    // OpenAI wants undefined if no tools are provided
    return toolSchemas.length > 0 ? toolSchemas : undefined;
  }

  protected findTool(funcName: string) {
    return this.tools.find((tool) => tool.funcName === funcName);
  }

  protected getPrompt(args: DefaultToolInput): string {
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
        lines.push(`- ${tool.funcName}: ${tool.description}`);
      });
    }

    lines.push(`Provided input: ${JSON.stringify(args)}`);
    lines.push(`Do not mention the tools used in your response.`);
    lines.push(`Respond as instructed.`);

    return lines.join("\n");
  }

  private async handleToolCalls(
    message: ChatCompletion.Choice["message"]
  ): Promise<ChatCompletionMessageParam[]> {
    const toolCalls = message.tool_calls!;

    console.log(
      "🔧 Tool calls detected:",
      toolCalls.map((t) => `${t.function.name}(${t.function.arguments})`)
    );

    const toolResults = await Promise.all(
      toolCalls.map(async (toolCall) => {
        const tool = this.findTool(toolCall.function.name);

        if (!tool) {
          throw new Error(`Tool ${toolCall.function.name} not found`);
        }

        console.log(`⚙️ Executing tool: ${toolCall.function.name}`);

        const args = JSON.parse(toolCall.function.arguments);
        const result = await tool.execute(args);

        console.log(`🔧 Tool result:`, result);

        return {
          result,
          toolCall,
        };
      })
    );

    return [
      {
        role: "assistant",
        content: message.content ?? "",
        tool_calls: toolCalls,
      },
      ...toolResults.map(({ result, toolCall }) => ({
        role: "tool" as const,
        content: JSON.stringify(result),
        tool_call_id: toolCall.id,
      })),
    ];
  }
}

export type LLMCompletion = (
  params: Partial<ChatCompletionCreateParamsNonStreaming>
) => Promise<ChatCompletion>;
