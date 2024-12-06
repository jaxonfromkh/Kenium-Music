import { EmbedBuilder } from "discord.js";

export const Command = {
    name: "loop",
    description: "Want some loop bro?",
    options: [
        {
          name: "mode",
          description: "Choose to loop the current song or the queue.",
          type: 3,
          required: true,
          choices: [
            { name: "track", value: "track" },
            { name: "queue", value: "queue" },
            { name: "off", value: "off" }
          ],
        },
      ],

    run: async (client, interaction) => {
        if (!interaction.member?.voice?.channel) return;
        const player = client.aqua.players.get(interaction.guildId);
        if (!player) return interaction.reply({ content: "Nothing is playing", ephemeral: true });
        if (interaction.guild.members.me.voice.channelId !== interaction.member.voice.channelId) return;

        const mode = interaction.options.getString("mode");

        switch (mode) {
            case "track":
                player.setLoop('track');
                break;
            case "queue":
                player.setLoop('queue');
                break;
            case "off":
                player.setLoop('none');
                break;
        }

        const status = mode === "off" ? "disabled" : player.loop ? "enabled" : player.queueRepeat ? "enabled" : "disabled";
        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(0x000000)
                    .setDescription(`${mode === "off" ? "Looping" : `Current song loop`} has been ${status}.`)
            ],
        });
    }
}
