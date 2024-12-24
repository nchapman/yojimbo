import { ChatCompletionTool } from "openai/resources/chat/completions";

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

export abstract class Tool<TArgs = DefaultToolInput, TReturn = string> {
  funcName: string;
  name: string;
  description: string;
  parameters: JSONSchema<TArgs>;

  constructor(
    name: string,
    description: string,
    parameters: JSONSchema<TArgs> = DEFAULT_PARAMETERS as JSONSchema<TArgs>
  ) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.funcName = this.getFuncName("Tool");
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

  abstract execute(args: TArgs): Promise<TReturn>;

  protected getFuncName(type: string) {
    let funcName = this.name.replace(/\s+/g, "");

    // Append Agent if it's not already in the name
    if (!funcName.toLowerCase().includes(type.toLowerCase())) {
      funcName += type;
    }

    return funcName;
  }

  protected trimBlock(block: string) {
    return block
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .join("\n");
  }
}
