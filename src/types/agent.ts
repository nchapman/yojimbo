import { JSONSchema } from "./schema";
import { DefaultToolInput, OmitBaseToolInput } from "./tools";
import { Tool } from "../tools/tool";
import { LLMCompletion } from "./openai";

export interface AgentConfig<TArgs = DefaultToolInput> {
  role: string;
  goal: string;
  approach?: string | string[];
  backstory?: string | string[];
  parameters?: JSONSchema<OmitBaseToolInput<TArgs>>;
  llm?: LLMCompletion;
  tools?: Tool[];
  maxIter?: number;
  verbose?: boolean;
  skipPropagation?: boolean;
  allowParallelToolCalls?: boolean;
}
