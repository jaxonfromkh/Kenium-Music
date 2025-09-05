import { config } from "seyfert";
import'dotenv/config';

export default config.bot({
    token: process.env.token ?? "",
    locations: {
        base: "dist",
        commands: "commands",
        events: "events",
    },
    intents: ["Guilds", "GuildMessages", "DirectMessages", "GuildVoiceStates"],
});