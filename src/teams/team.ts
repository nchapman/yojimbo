import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { Agent, AgentConfig } from "../agents/agent";
import { DefaultToolInput } from "../tools/tool";
import {
  buildTeamPrompt,
  buildTeamBasePrompt,
  buildTeamPlanPrompt,
  teamSystemPrompt,
} from "../prompts";

export interface TeamConfig<TArgs = DefaultToolInput>
  extends Omit<AgentConfig<TArgs>, "role" | "goal"> {
  role?: string;
  goal?: string;
  plan?: string;
  agents: Agent[];
}

export class Team<TArgs = DefaultToolInput, TReturn = string> extends Agent<
  TArgs,
  TReturn
> {
  private agents: Agent[];
  private plan: string | null;

  constructor(config: TeamConfig<TArgs>) {
    super({
      ...config,
      role: config.role ?? "Agent Manager",
      goal: config.goal ?? "Use the provided agents to respond to the input",
    });

    this.agents = config.agents;
    this.plan = config.plan ?? null;

    // Pass tools down to agents
    this.propagateToAgents();
    this.systemPrompt = teamSystemPrompt;
  }

  protected propagateToAgents() {
    this.agents.forEach((agent) => {
      // Set tools to the union of the team's tools and the agent's tools
      agent.tools = Array.from(new Set([...this.tools, ...agent.tools]));

      // Set llm if it's not set
      if (!agent.llm) {
        agent.llm = this.llm;
      }
    });
  }

  public async execute(args: TArgs): Promise<TReturn> {
    this.ensureLLM();

    // Get or generate the plan first
    await this.ensurePlan(args);

    console.log("📋 Plan:", this.plan);

    // Call the parent execute method with the enhanced args
    return super.execute(args);
  }

  // Tools in this context are agents
  public getToolSchemas() {
    return this.agents.map((agent) => agent.toSchema());
  }

  protected async ensurePlan(args: TArgs): Promise<void> {
    if (!this.plan) {
      const basePrompt = this.getBasePrompt(args);
      const steps = this.agents.length + 1;

      const planPrompt = buildTeamPlanPrompt({
        basePrompt,
        steps,
      });

      console.log("📋 Generating plan:", planPrompt);

      const messages: ChatCompletionMessageParam[] = [
        { role: "system", content: this.systemPrompt },
        { role: "user", content: planPrompt },
      ];

      const response = await this.llm!({ messages });
      this.plan = response.choices[0]?.message?.content ?? "No plan generated.";
    }
  }

  protected findTool(funcName: string) {
    return this.agents.find((agent) => agent.funcName === funcName);
  }

  protected getPrompt(args: TArgs): string {
    const basePrompt = this.getBasePrompt(args);

    return buildTeamPrompt({
      basePrompt,
      plan: this.plan,
      args: JSON.stringify(args),
    });
  }

  protected getBasePrompt(args: TArgs): string {
    return buildTeamBasePrompt({
      role: this.role,
      goal: this.goal,
      backstory: this.backstory,
      agents: this.agents,
      plan: this.plan,
      args: JSON.stringify(args),
    });
  }
}
