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

export type ChatCompletionTool = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: JSONSchema<T>["properties"];
    required?: JSONSchema<T>["required"];
  };
};

// Default input type with a generic input string
export interface DefaultToolInput {
  input: string;
}

const DEFAULT_PARAMETERS: JSONSchema<DefaultToolInput> = {
  properties: {
    input: {
      type: "string",
      description: "The input for the tool",
    },
  },
  required: ["input"],
};

export abstract class Tool<TArgs = DefaultToolInput, TReturn = string> {
  public readonly funcName: string;
  public readonly name: string;
  public readonly description: string;
  public readonly parameters: JSONSchema<TArgs>;

  constructor(
    name: string,
    description: string,
    parameters: JSONSchema<TArgs> = DEFAULT_PARAMETERS as JSONSchema<TArgs>
  ) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.funcName = name.replace(/\s+/g, "");
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
}
