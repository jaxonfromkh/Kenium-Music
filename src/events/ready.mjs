import { ActivityType } from "discord.js";
export const Event = {
    name: "ready",
    runOnce: true,
    run: async (client) => {

        client.aqua.init(client.user.id);

        const getActivities = () => [
            {
                name: `Made by mushroom0162 🙀🙀`,
                type: ActivityType.Custom,
                state: `Made by mushroom0162 🙀🙀`
            },
            {
                name: `Lavalink V4.0.8 `,
                type: ActivityType.Custom,
                state: `Running with Node.js v20.1.0 and Java 21`
            },
            {
                name: `Running on around ${client.guilds.cache.size} servers`,
                type: ActivityType.Custom,
                state: `Optimizing processes...`
            },
            {
                name: `With ${client.guilds.cache.reduce((a, b) => a + b.memberCount, 0)} users, prob none of them use this!!!`,
                type: ActivityType.Custom,
                state: `Idk what to put here... Lavalink + magmastream`
            }
        ];

        let stuffdex = 0;
        let activities = getActivities();
        const updateActivity = () => {
            // Refresh activities to get current data
            activities = getActivities();

            const activity = activities[stuffdex];

            client.user.setActivity({
                name: activity.name,
                type: activity.type,
                state: activity.state
            });

            currentIndex = (stuffdex + 1) % activities.length;
        };

        updateActivity();

        setInterval(updateActivity, 2 * 60 * 1000);
        client.user.setStatus("idle");
        console.log(`logged in ${client.user.tag}`)
    }
}