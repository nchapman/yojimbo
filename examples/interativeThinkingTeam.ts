import { OpenAI } from "openai";
import { Agent } from "../src/agents/agent";
import { LLMCompletion } from "../src/types/openai";
import { Team } from "../src/teams/team";

// At the top of the file, after imports
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Create the LLM completion function
const llm: LLMCompletion = async (args) => {
  return openai.chat.completions.create({
    model: "gpt-4o",
    ...args,
  });
};

const prompts = [
  "Analyze the complex interplay of social, economic, and political factors that led to the fall of the Soviet Union. Focus on key events like Gorbachev's reforms, the Chernobyl disaster, and the role of Western influence. Explore alternative outcomes if specific policies had been different.",
  "Design a new fantasy world with a feudal governance system, a resource-based economy reliant on magical artifacts, and a society divided by elemental affinities. Address how conflicts arise between factions competing for control of these artifacts and propose resolutions.",
  "A self-driving car in a suburban neighborhood must choose between hitting a child who has run onto the street or swerving into a pole, potentially injuring the elderly passenger. Develop a response system that prioritizes ethics, legality, and long-term trust in autonomous vehicles.",
  "Propose a novel interdisciplinary research project combining AI-driven climate modeling, public education campaigns in schools, and psychological studies on belief systems to address climate change denial. Include the potential role of social media platforms in dissemination.",
  "Rewrite the story of The Odyssey as a spacefaring epic where Odysseus commands a starship lost in uncharted space, encountering alien civilizations and cosmic phenomena. Maintain the themes of heroism and perseverance while adapting characters like the Sirens and Cyclops into this futuristic setting.",
  "Two neighboring countries—one with a collectivist culture valuing shared ownership and the other with an individualist culture emphasizing intellectual property rights—are negotiating a tech trade deal. Develop a strategy to bridge their differences while fostering mutual trust and economic growth.",
  "A mid-sized family-owned manufacturing company that produces household appliances is facing declining sales. They want to transition into smart home technology. Propose a transformation plan that includes developing IoT devices, retraining employees, and creating partnerships with tech companies.",
  "Compare and contrast how themes of power and control are explored in George Orwell’s 1984, with its dystopian surveillance state, and J.K. Rowling’s Harry Potter series, focusing on the Ministry of Magic and Voldemort's authoritarian rule. Discuss how the genres of political allegory and fantasy shape the audience's perceptions.",
  "A small town in the Midwest with a population of 10,000, a declining manufacturing base, and a large unused industrial space wants to reinvent itself as a tech hub. Develop a plan to attract remote workers, set up coworking spaces, and partner with nearby universities for innovation programs.",
  "Imagine a future where AI systems are used to allocate healthcare resources in an urban area with significant income inequality. Design an oversight model that ensures fairness, transparency, and equitable access while addressing public concerns about algorithmic bias and privacy.",
];

const analyst = new Agent({
  role: "Analyst",
  goal: "Break down the topic into a clear analytical framework that surfaces key insights and challenges",
});

const strategist = new Agent({
  role: "Strategist",
  goal: "Develop a comprehensive solution that addresses the core challenges identified",
});

const critic = new Agent({
  role: "Critic",
  goal: "Evaluate and strengthen the proposed solution",
});

const team = new Team({
  agents: [analyst, strategist, critic],
  goal: "Generate an insightful, well-structured response that demonstrates deep comprehension of the topic",
  llm,
});

const prompt = prompts[Math.floor(Math.random() * prompts.length)];

team.emitter.on("*", (event, data) => {
  const { tool, ...restData } = data;

  if (event === "delta" && "content" in data) {
    process.stdout.write(data.content);
  } else {
    process.stdout.write("\n");
    console.log(`${event}:`, restData);
  }
});

const response = await team.execute({
  input: prompt,
});

console.log("---");
console.log(prompt);
console.log("---");
console.log(response);
