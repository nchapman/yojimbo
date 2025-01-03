import {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionChunk,
  Stream,
  LLMCompletion,
  ChatCompletionMessageToolCall,
} from '../types/openai';
import { Tool } from '../tools/tool';
import { BaseToolInput, DefaultToolInput, WorkingMemory } from '../types/tools';
import { AgentConfig } from '../types/agent';
import { agentSystemPrompt, buildAgentPrompt, buildWorkingMemoryPrompt } from '../prompts';

export class Agent<TArgs extends BaseToolInput = DefaultToolInput, TReturn = string> extends Tool<
  TArgs,
  TReturn
> {
  private static readonly DEFAULT_MAX_ITER = 5;
  private static readonly VALID_FINISH_REASONS = ['stop', 'tool_calls', 'function_call'];

  public role: string;
  public goal: string;
  public approach?: string | string[];
  public backstory?: string | string[];
  public llm?: LLMCompletion;
  public tools: Tool[];
  public maxIter: number;
  public verbose: boolean;
  public allowParallelToolCalls: boolean;
  protected systemPrompt: string;

  constructor(config: AgentConfig<TArgs>) {
    super({
      name: config.role,
      description: config.goal,
      parameters: config.parameters,
      funcNameSuffix: 'Agent',
    });
    this.role = config.role;
    this.goal = config.goal;
    this.backstory = this.stringOrArrayToString(config.backstory);
    this.approach = this.stringOrArrayToString(config.approach);
    this.llm = config.llm;
    this.tools = config.tools ?? [];
    this.maxIter = config.maxIter ?? Math.max(this.tools.length, Agent.DEFAULT_MAX_ITER);
    this.verbose = config.verbose ?? false;
    this.systemPrompt = agentSystemPrompt;
    this.allowParallelToolCalls = config.allowParallelToolCalls ?? false;

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

    // Working memory: from our peers and for our tools
    const peersWorkingMemory: WorkingMemory[] = args.workingMemory ?? [];
    const toolsWorkingMemory: WorkingMemory[] = [];

    let messages: ChatCompletionMessageParam[] = [{ role: 'system', content: this.systemPrompt }];

    // If we have working memory, add it to the messages
    if (peersWorkingMemory.length > 0) {
      messages.push({
        role: 'assistant',
        content: this.workingMemoryToPrompt(peersWorkingMemory),
      });
    }

    // Placeholder for our prompt
    messages.push({ role: 'user', content: '' });

    let i = 0;
    while (i <= this.maxIter) {
      const isLastIteration = i === this.maxIter;
      const includeTools = !isLastIteration;
      const toolsForThisIteration = includeTools ? tools : undefined;
      const parallelToolCalls = toolsForThisIteration?.length
        ? this.allowParallelToolCalls
        : undefined;

      // Update the user message with the prompt
      this.updateLastUserMessage(messages, this.getPrompt(args, includeTools));

      // Create a new response to accumulate the streaming content
      let accumulatedContent = '';
      let toolCalls: ChatCompletion.Choice['message']['tool_calls'] = [];
      let refusal: string | undefined = undefined;
      let finishReason: string | null = null;

      const stream = (await this.llm!({
        messages,
        tools: toolsForThisIteration,
        stream: true,
        parallel_tool_calls: parallelToolCalls,
      })) as Stream<ChatCompletionChunk>;

      // Process each chunk of the stream
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        // Skip if no delta
        if (!delta) continue;

        // Track finish reason
        finishReason = chunk.choices[0].finish_reason;

        // Track refusal if present
        if (delta.refusal) {
          refusal = delta.refusal;
        }

        // Accumulate content if present
        if (delta.content) {
          accumulatedContent += delta.content;
          this.emit('delta', { content: delta.content });
        }

        // Handle tool calls
        if (delta.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            // Initialize tool call if it's new
            if (toolCall.index !== undefined) {
              toolCalls[toolCall.index] = toolCalls[toolCall.index] || {
                id: toolCall.id || '',
                type: 'function',
                function: { name: '', arguments: '' },
              };

              // Update the tool call properties
              if (toolCall.id) toolCalls[toolCall.index].id = toolCall.id;
              if (toolCall.function?.name) {
                toolCalls[toolCall.index].function.name = toolCall.function.name;
              }
              if (toolCall.function?.arguments) {
                toolCalls[toolCall.index].function.arguments += toolCall.function.arguments;
              }
            }
          }
        }
      }

      // Warn about unexpected finish reasons
      if (!Agent.VALID_FINISH_REASONS.includes(finishReason ?? '')) {
        this.emit('warn', {
          message: `Unexpected finish reason: ${finishReason}`,
        });
      }

      // Create a synthetic message that looks like a non-streaming response
      const syntheticMessage: ChatCompletion.Choice['message'] = {
        role: 'assistant',
        content: accumulatedContent,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        refusal: refusal ?? null,
      };

      // Return the final response if no tool calls are detected
      if (!syntheticMessage.tool_calls) {
        return (syntheticMessage.content ?? 'Sorry, no response was generated') as TReturn;
      }

      // Handle tool calls as before
      const newMessages = await this.executeToolCalls(syntheticMessage, toolsWorkingMemory);
      messages.push(...newMessages);
      i++;
    }

    return 'Sorry, we reached the maximum number of iterations without a response' as TReturn;
  }

  protected updateLastUserMessage(messages: ChatCompletionMessageParam[], content: string) {
    const lastUserMessage = messages.findLast((message) => message.role === 'user');

    if (!lastUserMessage) {
      throw new Error('No user message found');
    }

    lastUserMessage.content = content;
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
    const { workingMemory, ...restArgs } = args;
    return buildAgentPrompt({
      role: this.role,
      goal: this.goal,
      approach: this.approach,
      backstory: this.backstory,
      tools: includeTools ? this.tools : undefined,
      args: JSON.stringify(restArgs),
    });
  }

  protected ensureLLM() {
    if (!this.llm) {
      throw new Error('LLM not configured');
    }
  }

  private async executeToolCalls(
    message: ChatCompletion.Choice['message'],
    workingMemory: WorkingMemory[]
  ): Promise<ChatCompletionMessageParam[]> {
    const toolCalls = message.tool_calls!;

    // Execute tools either in parallel or series based on allowParallelToolCalls
    // Models should respect this setting but it's not always the case (especially with open models)
    let toolResults;
    if (this.allowParallelToolCalls) {
      toolResults = await Promise.all(
        toolCalls.map((tc) => this.executeToolCall(tc, workingMemory))
      );
    } else {
      toolResults = [];
      for (const toolCall of toolCalls) {
        const result = await this.executeToolCall(toolCall, workingMemory);
        toolResults.push(result);
      }
    }

    // Add the tool results to the working memory
    workingMemory.push(
      ...toolResults.map(({ result, toolCall }) => ({
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
        result: JSON.stringify(result),
      }))
    );

    return [
      {
        role: 'assistant',
        content: message.content ?? '',
        tool_calls: toolCalls,
      },
      ...toolResults.map(({ result, toolCall }) => ({
        role: 'tool' as const,
        content: JSON.stringify(result),
        tool_call_id: toolCall.id,
      })),
    ];
  }

  private async executeToolCall(
    toolCall: ChatCompletionMessageToolCall,
    workingMemory: WorkingMemory[]
  ) {
    const tool = this.findTool(toolCall.function.name);
    if (!tool) {
      return {
        result: { error: `Tool ${toolCall.function.name} not found` },
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
      const result = await tool.execute({ workingMemory, ...args });
      return { args, result, toolCall };
    } catch (e: any) {
      return {
        result: { error: `Error executing tool: ${e.message}` },
        toolCall,
      };
    }
  }

  protected workingMemoryToPrompt(workingMemory: WorkingMemory[]): string {
    return buildWorkingMemoryPrompt({
      hasWorkingMemory: workingMemory.length > 0,
      workingMemory,
    });
  }

  protected stringOrArrayToString(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value)
      ? value.map((item, index) => `${index + 1}. ${item}`).join('\n')
      : value;
  }
}
