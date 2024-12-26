import { ChatCompletionTool } from '../types/openai';
import mitt, { Emitter } from 'mitt';
import { ulid } from 'ulid';
import { JSONSchema } from '../types/schema';
import {
  BaseToolEvent,
  ToolEvents,
  DefaultToolInput,
  BaseToolInput,
  OmitBaseToolInput,
} from '../types/tools';
import Ajv from 'ajv';

const DEFAULT_PARAMETERS: JSONSchema<Omit<DefaultToolInput, keyof BaseToolInput>> = {
  properties: {
    input: {
      type: 'string',
      description: 'Minimum input needed to complete the task',
    },
  },
  required: ['input'],
};

export abstract class Tool<TArgs extends BaseToolInput = DefaultToolInput, TReturn = string> {
  id: string;
  funcName: string;
  name: string;
  description: string;
  parameters: JSONSchema<OmitBaseToolInput<TArgs>>;
  emitter: Emitter<ToolEvents>;
  parentTool?: Tool<any, any>;

  constructor(
    name: string,
    description: string,
    parameters: JSONSchema<OmitBaseToolInput<TArgs>> = DEFAULT_PARAMETERS as JSONSchema<
      OmitBaseToolInput<TArgs>
    >,
    emitter?: Emitter<ToolEvents>,
    parentTool?: Tool<any, any>,
  ) {
    this.id = ulid();
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.funcName = this.getFuncName('Tool');
    this.emitter = emitter || mitt();
    this.parentTool = parentTool;
  }

  public toSchema(): ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: this.funcName,
        description: this.description,
        parameters: {
          type: 'object',
          properties: this.parameters.properties,
          required: this.parameters.required,
        },
      },
    };
  }

  public async execute(args: TArgs): Promise<TReturn> {
    try {
      const { workingMemory, ...restArgs } = args;
      // Make sure the arguments are valid
      this.validateArgsOrThrow(restArgs as TArgs);

      this.emit('start', {
        message: `Starting ${this.name}`,
        args: restArgs,
      });

      const result = await this.run(args);

      this.emit('complete', {
        message: `Successfully completed ${this.name}`,
      });

      return result;
    } catch (error: any) {
      this.emit('complete', {
        message: `Failed to complete ${this.name}`,
        error,
      });
      throw error;
    }
  }

  protected abstract run(args: TArgs): Promise<TReturn>;

  protected getFuncName(type: string) {
    let funcName = this.name.replace(/\s+/g, '');

    // Append Agent if it's not already in the name
    if (!funcName.toLowerCase().includes(type.toLowerCase())) {
      funcName += type;
    }

    return funcName;
  }

  protected getGraphId(): string {
    const nameWithId = `${this.name}:${this.id}`.replace(/\s+/g, '');
    const graphId = this.parentTool ? `${this.parentTool.getGraphId()}->${nameWithId}` : nameWithId;

    return graphId;
  }

  protected getDepth(): number {
    return this.parentTool ? this.parentTool.getDepth() + 1 : 0;
  }

  protected emit(
    event: keyof ToolEvents,
    data: Omit<ToolEvents[keyof ToolEvents], keyof BaseToolEvent>,
  ) {
    if (!this.emitter) return;

    const allData = {
      id: this.getGraphId(),
      depth: this.getDepth(),
      tool: this,
      ...data,
    } as unknown as ToolEvents[keyof ToolEvents];

    this.emitter.emit(event, allData);
  }

  public on<K extends keyof ToolEvents>(event: K, listener: (data: ToolEvents[K]) => void) {
    this.emitter.on(event, listener as any);
  }

  public off<K extends keyof ToolEvents>(event: K, listener: (data: ToolEvents[K]) => void) {
    this.emitter.off(event, listener as any);
  }

  protected validateArgsOrThrow(args: TArgs) {
    const ajv = new Ajv({ strict: false });
    const validator = ajv.compile(this.parameters);
    const isValid = validator(args);

    if (!isValid) {
      throw new Error(`Invalid arguments: ${ajv.errorsText(validator.errors)}`);
    }
  }
}
