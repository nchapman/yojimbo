import { Emitter } from 'mitt';
import { Tool } from '../tools/tool';
import { PlanStep } from './team';
import { JSONSchema } from './schema';

export interface ToolConfig<TArgs extends BaseToolInput = DefaultToolInput> {
  name: string;
  description: string;
  parameters?: JSONSchema<OmitBaseToolInput<TArgs>>;
  emitter?: Emitter<ToolEvents>;
  parentTool?: Tool<any, any>;
  funcNameSuffix?: string;
}

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
  plan: BaseToolEvent & {
    plan: PlanStep[];
  };
};

export type ToolEventListener = {
  event: keyof ToolEvents;
  handler: (data: ToolEvents[keyof ToolEvents]) => void;
};

export interface WorkingMemory {
  name: string;
  arguments: string;
  result: string;
}

export interface BaseToolInput {
  workingMemory?: WorkingMemory[];
}

export type OmitBaseToolInput<T> = Omit<T, keyof BaseToolInput>;

export interface DefaultToolInput extends BaseToolInput {
  input: string;
}
