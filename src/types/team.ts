import { AgentConfig } from "./agent";
import { DefaultToolInput } from "./tools";
import { Agent } from "../agents/agent";

export interface TeamConfig<TArgs = DefaultToolInput>
  extends Omit<AgentConfig<TArgs>, "role" | "goal"> {
  role?: string;
  goal?: string;
  plan?: string | string[];
  agents: Agent[];
}
