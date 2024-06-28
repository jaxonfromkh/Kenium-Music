import { readdir } from "fs/promises";
import { join } from "path";

export const ButtonHandler = async (client, rootPath) => {
    const buttonDir = join(rootPath, "src", "interactionEvents", "buttons");
    const buttonFiles = await readdir(buttonDir);

    await Promise.all(
        buttonFiles.map(async (buttonFile) => {
            const { Button } = await import(`file://${join(buttonDir, buttonFile)}`);
            if (Button && !Button.ignore && Button.name) {
                client.buttonCommands.set(Button.name, Button);
            }
        })
    );
}