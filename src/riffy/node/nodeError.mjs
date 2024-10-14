import { client } from '../../../bot.mjs'

client.riffy.on("nodeError", async (node, error) => {
    console.log("\n---------------------")
    console.log(`Node ${node.name} encountered an error: ${error.message}`, "error")
    console.log("---------------------")
})