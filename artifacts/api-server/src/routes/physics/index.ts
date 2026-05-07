import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, messages as messagesTable } from "@workspace/db";
import { ListPhysicsArtifactsParams } from "@workspace/api-zod";

const router: IRouter = Router();

const PHYSICS_TOPICS = [
  {
    id: "projectile-motion",
    name: "Projectile Motion",
    description: "Explore trajectories, range, and height under gravity",
    icon: "🚀",
    examplePrompts: [
      "Plot projectile trajectories for 30°, 45°, and 60° launch angles at 20 m/s",
      "What is the range of a ball launched at 45° with velocity 15 m/s?",
      "How does increasing launch speed affect the maximum height?",
      "Compare trajectories on the Moon vs Earth for the same launch conditions",
    ],
  },
  {
    id: "circular-motion",
    name: "Circular Motion",
    description: "Centripetal force, angular velocity, and orbital mechanics",
    icon: "⭕",
    examplePrompts: [
      "Show how centripetal acceleration varies with radius at constant speed",
      "Calculate the orbital speed of the ISS at 400 km altitude",
      "Plot angular velocity vs period for circular motion",
      "What centripetal force is needed to keep a 2 kg ball on a 1 m string at 3 m/s?",
    ],
  },
  {
    id: "conservation-laws",
    name: "Conservation Laws",
    description: "Energy, momentum, and angular momentum conservation",
    icon: "⚡",
    examplePrompts: [
      "Show energy conservation in a pendulum swing",
      "Calculate the velocity after an elastic collision between 1 kg and 2 kg masses",
      "Plot KE and PE over time for a falling object",
      "What is the final velocity in a perfectly inelastic collision at 5 m/s and 3 m/s?",
    ],
  },
  {
    id: "harmonic-oscillators",
    name: "Harmonic Oscillators",
    description: "Springs, pendulums, and oscillation dynamics",
    icon: "🌀",
    examplePrompts: [
      "Plot displacement vs time for a spring-mass system with k=10 N/m, m=0.5 kg",
      "How does damping coefficient affect oscillation decay?",
      "Compare periods for different pendulum lengths",
      "Show phase space (velocity vs position) for simple harmonic motion",
    ],
  },
  {
    id: "wave-propagation",
    name: "Wave Propagation",
    description: "Wave mechanics, interference, and superposition",
    icon: "〜",
    examplePrompts: [
      "Plot two waves with different frequencies and their superposition",
      "Show constructive and destructive interference patterns",
      "How does wave speed relate to frequency and wavelength?",
      "Visualize a standing wave in a string of length 2 m",
    ],
  },
  {
    id: "kinematics",
    name: "Kinematics",
    description: "Position, velocity, and acceleration in 1D and 2D",
    icon: "📈",
    examplePrompts: [
      "Plot position, velocity, and acceleration for uniform acceleration of 3 m/s²",
      "A car accelerates from 0 to 60 mph in 6 seconds — plot its motion",
      "Show velocity-time graph for free fall from 100 m",
      "Calculate stopping distance for a car going 90 km/h with deceleration 6 m/s²",
    ],
  },
];

router.get("/physics/topics", async (_req, res): Promise<void> => {
  res.json(PHYSICS_TOPICS);
});

router.get("/physics/conversations/:id/artifacts", async (req, res): Promise<void> => {
  const params = ListPhysicsArtifactsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, params.data.id));

  const artifacts: Array<{
    id: number;
    conversationId: number;
    messageId: number;
    type: string;
    title: string;
    data: string;
    createdAt: Date;
  }> = [];

  let artifactId = 1;
  for (const message of messages) {
    if (message.role !== "assistant") continue;

    const chartMatches = message.content.matchAll(/<chart>([\s\S]*?)<\/chart>/g);
    for (const match of chartMatches) {
      try {
        const chartData = JSON.parse(match[1].trim());
        artifacts.push({
          id: artifactId++,
          conversationId: params.data.id,
          messageId: message.id,
          type: "chart",
          title: chartData.title || "Chart",
          data: match[1].trim(),
          createdAt: message.createdAt,
        });
      } catch {
        // skip malformed chart data
      }
    }

    const tableMatches = message.content.matchAll(/<table>([\s\S]*?)<\/table>/g);
    for (const match of tableMatches) {
      try {
        const tableData = JSON.parse(match[1].trim());
        artifacts.push({
          id: artifactId++,
          conversationId: params.data.id,
          messageId: message.id,
          type: "table",
          title: tableData.headers ? "Data Table" : "Table",
          data: match[1].trim(),
          createdAt: message.createdAt,
        });
      } catch {
        // skip malformed table data
      }
    }
  }

  res.json(artifacts);
});

export default router;
