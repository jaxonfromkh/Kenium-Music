import { ActivityType } from "discord.js";
export const Event = {
    name: "ready",
    runOnce: true,
    run: async (client) => {
        client.aqua.init(client.user.id);
        const activities = [
            {
                name: `👨‍💻 Made by mushroom0162`,
                type: ActivityType.Custom,
                state: `✨ Made by mushroom0162`
            },
            {
                name: `🎶 Lavalink V4.0.8 `,
                type: ActivityType.Custom,
                state: `🚀 Running with Node.js v21.7.3 and Java 21`
            },
            {
                name: `🌐 Running on ${client.guilds.cache.size} servers`,
                type: ActivityType.Custom,
                state: `⚙️ Optimizing processes... or not`
            },
            {
                name: `👥 With ${client.guilds.cache.reduce((a, b) => a + b.memberCount, 0)} users, prob none of them use this!!!`,
                type: ActivityType.Custom,
                state: `🤷‍♂️ Idk what to put here... Lavalink + aqualink`
            }
        ];

        let currentIndex = 0;
        const updateActivity = () => {
            client.user.setActivity(activities[currentIndex++ % activities.length]);
        };

        updateActivity();

        setInterval(updateActivity, 2 * 60 * 1000);
        client.user.setStatus("idle");
        console.log(`logged in ${client.user.tag}`)
    }
}
