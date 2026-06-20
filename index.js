require('dotenv').config();
const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const REACTION_EMOJI = '🔔';

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    const commands = [
        new SlashCommandBuilder()
            .setName('notify')
            .setDescription('Send a notification to everyone with this thread\'s role.')
            .addStringOption(option =>
                option.setName('message')
                    .setDescription('The message to send with the notification')
                    .setRequired(true)
            )
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('Started refreshing application (/) commands.');
        if (process.env.CLIENT_ID) {
            await rest.put(
                Routes.applicationCommands(process.env.CLIENT_ID),
                { body: commands },
            );
            console.log('Successfully reloaded application (/) commands.');
        } else {
            console.warn('CLIENT_ID not found in environment variables. Slash commands may not be registered properly if using global scopes.');
            await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: commands },
            );
        }
    } catch (error) {
        console.error('Error refreshing application commands:', error);
    }
});

client.on('threadCreate', async (thread) => {
    try {
        const role = await thread.guild.roles.create({
            name: thread.name,
            reason: `Role for thread: ${thread.name}`,
            mentionable: false,
        });

        const message = await thread.send(`React to this message with ${REACTION_EMOJI} to receive the <@&${role.id}> role and be notified of updates!`);
        await message.react(REACTION_EMOJI);
    } catch (error) {
        console.error(`Error handling threadCreate for ${thread.name}:`, error);
    }
});

client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;

    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Something went wrong when fetching the message:', error);
            return;
        }
    }

    if (reaction.emoji.name !== REACTION_EMOJI) return;

    const message = reaction.message;
    if (!message.channel.isThread()) return;
    if (message.author.id !== client.user.id) return;

    const guild = message.guild;
    const thread = message.channel;
    
    const role = guild.roles.cache.find(r => r.name === thread.name);
    
    if (role) {
        try {
            const member = await guild.members.fetch(user.id);
            await member.roles.add(role);
        } catch (error) {
            console.error(`Failed to assign role to ${user.tag}:`, error);
        }
    }
});

client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;

    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Something went wrong when fetching the message:', error);
            return;
        }
    }

    if (reaction.emoji.name !== REACTION_EMOJI) return;

    const message = reaction.message;
    if (!message.channel.isThread()) return;
    if (message.author.id !== client.user.id) return;

    const guild = message.guild;
    const thread = message.channel;
    
    const role = guild.roles.cache.find(r => r.name === thread.name);
    
    if (role) {
        try {
            const member = await guild.members.fetch(user.id);
            await member.roles.remove(role);
        } catch (error) {
            console.error(`Failed to remove role from ${user.tag}:`, error);
        }
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'notify') {
        const thread = interaction.channel;
        
        if (!thread.isThread()) {
            return interaction.reply({ content: 'This command can only be used inside a thread.', ephemeral: true });
        }

        if (interaction.user.id !== thread.ownerId) {
            return interaction.reply({ content: 'Only the creator of this thread can use this command.', ephemeral: true });
        }

        const messageContent = interaction.options.getString('message');
        const role = interaction.guild.roles.cache.find(r => r.name === thread.name);

        if (!role) {
            return interaction.reply({ content: `Could not find a role named "${thread.name}".`, ephemeral: true });
        }

        await interaction.reply({ content: `Notification sent!`, ephemeral: true });
        await thread.send(`<@&${role.id}>\n\n**Update from thread owner:**\n${messageContent}`);
    }
});

if (!process.env.DISCORD_TOKEN) {
    console.error('Error: DISCORD_TOKEN is missing in the environment variables.');
    process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
