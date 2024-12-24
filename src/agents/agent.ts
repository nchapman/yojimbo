import {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionCreateParams,
  ChatCompletionChunk,
} from "openai/resources/chat/completions";
import { Stream } from "openai/streaming";
import { Tool, DefaultToolInput, JSONSchema } from "../tools/tool";
import { agentSystemPrompt, buildAgentPrompt } from "../prompts";

export interface AgentConfig<TArgs = DefaultToolInput> {
  role: string;
  goal?: string | null;
  backstory?: string | null;
  parameters?: JSONSchema<TArgs>;
  llm?: LLMCompletion;
  tools?: Tool[] | null;
  maxIter?: number | null;
  verbose?: boolean | null;
  skipPropagation?: boolean;
}

export class Agent<TArgs = DefaultToolInput, TReturn = string> extends Tool<
  TArgs,
  TReturn
> {
  public role: string;
  public goal: string | null;
  public backstory: string | null;
  public llm?: LLMCompletion;
  public tools: Tool[];
  public maxIter: number;
  public verbose: boolean;
  protected systemPrompt: string;

  constructor(config: AgentConfig<TArgs>) {
    super(config.role, config.goal ?? "", config.parameters);
    this.role = config.role;
    this.goal = config.goal ?? null;
    this.backstory = config.backstory ?? null;
    this.llm = config.llm;
    this.tools = config.tools ?? [];
    this.maxIter = config.maxIter ?? Math.max(this.tools.length, 5);
    this.verbose = config.verbose ?? false;
    this.funcName = this.getFuncName("Agent");
    this.systemPrompt = agentSystemPrompt;

    if (!config.skipPropagation) {
      this.propagate();
    }
  }

  public propagate(): void {
    this.tools.forEach((tool: Tool) => {
      tool.parentTool = this;
      tool.emitter = this.emitter;
    });
  }

  protected async run(args: TArgs): Promise<TReturn> {
    this.ensureLLM();
    const tools = this.getToolSchemas();

    let messages: ChatCompletionMessageParam[] = [
      { role: "system", content: this.systemPrompt },
      { role: "user", content: "" },
    ];

    let i = 0;
    while (i <= this.maxIter) {
      const isLastIteration = i === this.maxIter;
      const includeTools = !isLastIteration;

      const prompt = this.getPrompt(args, includeTools);
      messages[1].content = prompt;

      // Create a new response to accumulate the streaming content
      let accumulatedContent = "";
      let toolCalls: ChatCompletion.Choice["message"]["tool_calls"] = [];
      let refusal: string | null = null;

      const stream = (await this.llm!({
        messages,
        tools: includeTools ? tools : undefined,
        stream: true,
      })) as Stream<ChatCompletionChunk>;

      // Process the stream
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        // Accumulate content if present
        if (delta?.content) {
          accumulatedContent += delta.content;
          // Emit the partial content for real-time updates
          this.emit("delta", { content: delta.content });
        }

        // Track refusal if present
        if (delta?.refusal !== undefined) {
          refusal = delta.refusal;
        }

        // Handle tool calls - they usually come at the end
        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            // Initialize tool call if it's new
            if (toolCall.index !== undefined) {
              toolCalls[toolCall.index] = toolCalls[toolCall.index] || {
                id: toolCall.id || "",
                type: "function",
                function: { name: "", arguments: "" },
              };

              // Update the tool call properties
              if (toolCall.id) toolCalls[toolCall.index].id = toolCall.id;
              if (toolCall.function?.name) {
                toolCalls[toolCall.index].function.name =
                  toolCall.function.name;
              }
              if (toolCall.function?.arguments) {
                toolCalls[toolCall.index].function.arguments +=
                  toolCall.function.arguments;
              }
            }
          }
        }
      }

      // Create a synthetic message that looks like a non-streaming response
      const syntheticMessage: ChatCompletion.Choice["message"] = {
        role: "assistant",
        content: accumulatedContent,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        refusal: refusal,
      };

      // Return the final response if no tool calls are detected
      if (!syntheticMessage.tool_calls) {
        return (syntheticMessage.content ??
          "Sorry, no response was generated") as TReturn;
      }

      // Handle tool calls as before
      const newMessages = await this.executeToolCalls(syntheticMessage);
      messages.push(...newMessages);
      i++;
    }

    return "Sorry, we reached the maximum number of iterations without a response" as TReturn;
  }

  public getToolSchemas() {
    const toolSchemas = this.tools.map((tool) => tool.toSchema());

    // OpenAI wants undefined if no tools are provided
    return toolSchemas.length > 0 ? toolSchemas : undefined;
  }

  protected findTool(funcName: string) {
    return this.tools.find((tool) => tool.funcName === funcName);
  }

  protected getPrompt(args: TArgs, includeTools = true): string {
    return buildAgentPrompt({
      role: this.role,
      goal: this.goal,
      backstory: this.backstory,
      tools: includeTools ? this.tools : undefined,
      args: JSON.stringify(args),
    });
  }

  protected ensureLLM() {
    if (!this.llm) {
      throw new Error("LLM not configured");
    }
  }

  private async executeToolCalls(
    message: ChatCompletion.Choice["message"]
  ): Promise<ChatCompletionMessageParam[]> {
    const toolCalls = message.tool_calls!;

    const toolResults = await Promise.all(
      toolCalls.map(async (toolCall) => {
        const tool = this.findTool(toolCall.function.name);
        if (!tool) {
          return {
            result: {
              error: `Tool ${toolCall.function.name} not found`,
            },
            toolCall,
          };
        }

        let args;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch (e) {
          return {
            result: {
              error: `Invalid JSON object: ${toolCall.function.arguments}`,
            },
            toolCall,
          };
        }

        try {
          const result = await tool.execute(args);
          return { result, toolCall };
        } catch (e: any) {
          return {
            result: {
              error: `Error executing tool: ${e.message}`,
            },
            toolCall,
          };
        }
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
  params: Omit<ChatCompletionCreateParams, "model">
) => Promise<ChatCompletion | Stream<ChatCompletionChunk>>;
