import { ChatCompletionTool } from "openai/resources/chat/completions";
import mitt, { Emitter } from "mitt";

export type JSONSchemaType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array";

export type JSONSchema<T> = {
  properties: {
    [K in keyof T]: {
      type: JSONSchemaType;
      description: string;
    };
  };
  required?: (keyof T)[];
};

// Default input type with a generic input string
export interface DefaultToolInput {
  input: string;
}

const DEFAULT_PARAMETERS: JSONSchema<DefaultToolInput> = {
  properties: {
    input: {
      type: "string",
      description: "Minimum input needed to complete the task",
    },
  },
  required: ["input"],
};

type ToolEvents = {
  status: string;
};

export abstract class Tool<TArgs = DefaultToolInput, TReturn = string> {
  funcName: string;
  name: string;
  description: string;
  parameters: JSONSchema<TArgs>;
  emitter: Emitter<ToolEvents>;

  constructor(
    name: string,
    description: string,
    parameters: JSONSchema<TArgs> = DEFAULT_PARAMETERS as JSONSchema<TArgs>,
    emitter?: Emitter<ToolEvents>
  ) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.funcName = this.getFuncName("Tool");
    this.emitter = emitter || mitt();
  }

  public toSchema(): ChatCompletionTool {
    return {
      type: "function",
      function: {
        name: this.funcName,
        description: this.description,
        parameters: {
          type: "object",
          properties: this.parameters.properties,
          required: this.parameters.required,
        },
      },
    };
  }

  public async execute(args: TArgs): Promise<TReturn> {
    try {
      this.emitter.emit("status", `Starting ${this.name}`);

      const result = await this.run(args);

      this.emitter.emit("status", `Completed ${this.name}`);
      return result;
    } catch (e: any) {
      this.emitter.emit("status", `Failed ${this.name}: ${e.message}`);
      throw e;
    }
  }

  protected abstract run(args: TArgs): Promise<TReturn>;

  protected getFuncName(type: string) {
    let funcName = this.name.replace(/\s+/g, "");

    // Append Agent if it's not already in the name
    if (!funcName.toLowerCase().includes(type.toLowerCase())) {
      funcName += type;
    }

    return funcName;
  }
}
