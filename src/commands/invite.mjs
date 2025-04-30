import {ContainerBuilder } from "discord.js";

export const Command = {
    name: "invite",
    description: "Invite Kenium cuz yes",
    options: [],
    run: async (client, interaction) => {
            const embedsv2 = new ContainerBuilder({
                components: [
                    {
                        "type": 10,
                        "content": `
                ## [🌀 Imagine needing to PAY or VOTE just to use a music bot? Hell nah.](https://discord.com/oauth2/authorize?client_id=1202232935311495209)
                
Why deal with paywalls, sketchy premium tiers, or begging for votes every hour just to play your favorite tracks? Kenium says NO to that nonsense. Here's why you'll vibe with it:
                
🔥 **Free. Forever.** No hidden fees, no "premium-only" commands, no ads. YouTube, Spotify, SoundCloud, Vimeo - slash into any platform, zero cash needed.
**24/7 bangers** - High-quality audio, lightning-fast responses, and ZERO downtime.
🤖 **Simplicity rules** - Type /play and boom, your queue's popping. No PhD in Discord bot navigation required.
🔓 **Open source & transparent** - Peek under the hood anytime. No shady code, just real freedom.
🎧 **Playlists? Free. Filters? Free.** - Crank up the bass, slow down the vibe, or queue 10-hour lo-fi - zero cash needed.
💻 **Made with Aqualink** - fast, performant, stable lavalink handler, and self-coded
**Start now**: Using </play:1254868331748528302>
                
Ain't nobody got time for cash-grabbing bots or democracy-for-a-playlist schemes. Kenium keeps it real: **you press play, we handle the rest.**
# 👉 **[Invite Kenium](https://discord.com/oauth2/authorize?client_id=1202232935311495209)** 
                        `.trim(),
                    },
                    {
                        type: 1,
                        components: [
                            {
                                type: 2,
                                style: 5,
                                label: "Support Server",
                                url: "https://discord.com/invite/K4CVv84VBC"
                            },
                            {
                                type: 2,
                                style: 5,
                                label: "GitHub",
                                url: "https://github.com/ToddyTheNoobDud/Kenium-Music"
                            },
                            {
                                type: 2,
                                style: 5,
                                label: "Website",
                                url: "https://toddythenoobdud.github.io/"
                            }
                          ],
                    },
                ]
            })

        await interaction.reply({  components: [embedsv2], flags: ["64", "32768"] });
    }
};
