import { Tool } from "../tools/tool";

// Base event type with common fields
export type BaseToolEvent = {
  id: string;
  depth: number;
  tool: Tool<any, any>;
};

export type ToolEvents = {
  start: BaseToolEvent & {
    message: string;
  };
  complete: BaseToolEvent & {
    message: string;
    error?: Error;
  };
  delta: BaseToolEvent & {
    content: string;
  };
  data: BaseToolEvent & {
    data: any;
  };
  warn: BaseToolEvent & {
    message: string;
  };
};

export interface DefaultToolInput {
  input: string;
}
