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
    args?: any;
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

export interface Scratchpad {
  tool: string;
  result: string;
}

export interface BaseToolInput {
  scratchpad?: Scratchpad[];
}

export interface DefaultToolInput extends BaseToolInput {
  input: string;
}
