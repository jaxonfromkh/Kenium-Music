import { client } from '../../../bot.mjs'


client.riffy.on("nodeConnect", async (node) => {
    console.log("\n---------------------")
    console.log(`Node ${node.name} has connected.`, "info")
    console.log("---------------------")
})