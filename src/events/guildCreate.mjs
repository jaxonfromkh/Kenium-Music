import {
    EmbedBuilder,
    PermissionsBitField,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from "discord.js";

const REQUIRED_PERMISSIONS = [
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.EmbedLinks,
    PermissionsBitField.Flags.AttachFiles
];

function createWelcomeEmbed(client) {
    return new EmbedBuilder()
        .setColor(0x000000)
        .setTitle('Kenium - An Open Source Bot')
        .setDescription(`
🌀 Imagine needing to PAY or VOTE just to use a music bot? Hell nah.

Why deal with paywalls, sketchy premium tiers, or begging for votes every hour just to play your favorite tracks? Kenium says NO to that nonsense. Here’s why you’ll vibe with it:

🔥 **Free. Forever.** No hidden fees, no "premium-only" commands, no ads. YouTube, Spotify, SoundCloud, Vimeo - slash into any platform, zero cash needed.
🎶 **24/7 bangers** - High-quality audio, lightning-fast responses, and ZERO downtime.
🤖 **Simplicity rules** - Type /play and boom, your queue's popping. No PhD in Discord bot navigation required.
🔓 **Open source & transparent** - Peek under the hood anytime. No shady code, just real freedom.
🎧 **Playlists? Free. Filters? Free.** - Crank up the bass, slow down the vibe, or queue 10-hour lo-fi - zero cash needed.
💻 **Made with Aqualink** - fast, performant, stable lavalink handler, and self-coded
🎶 **Start now**: Using </play:1254868331748528302>

Ain't nobody got time for cash-grabbing bots or democracy-for-a-playlist schemes. Kenium keeps it real: you press play, we handle the rest.
        `.trim())
        .setTimestamp()
        .setFooter({
            text: 'By mushroom0162 | Kenium v3.6.0',
            iconURL: client.user.displayAvatarURL()
        })
        .setThumbnail(client.user.displayAvatarURL());
}

function createActionRow() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel('Support Server')
                .setURL('https://discord.com/invite/K4CVv84VBC')
                .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setLabel('Invite to Discord')
                .setURL('https://discord.com/oauth2/authorize?client_id=1202232935311495209')
                .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
                .setLabel('website')
                .setURL('https://toddythenoobdud.github.io/')
                .setStyle(ButtonStyle.Link)
        );
}

async function findSuitableChannel(guild, client) {
    const channels = [
        guild.publicUpdatesChannel,
        ...guild.channels.cache
            .filter(c => c.type === 0)
            .values()
    ];
    return channels.find(channel =>
        channel?.viewable &&
        channel?.permissionsFor(client.user)?.has(REQUIRED_PERMISSIONS)
    );
}
export const Event = {
    name: "guildCreate",
    runOnce: false,
    run: async (client, guild) => {
        const suitableChannel = await findSuitableChannel(guild, client);
        if (suitableChannel) {
            const welcomeEmbed = createWelcomeEmbed(client);
            const actionRow = createActionRow();
            await suitableChannel.send({ embeds: [welcomeEmbed], components: [actionRow] });
        } else {
            console.log(`No suitable channel found in guild: ${guild.name}`);
        }
    }
};