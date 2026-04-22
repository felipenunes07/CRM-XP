import { pool, redis } from "../db/client.js";
import { logger } from "../lib/logger.js";
import { bootstrapPlatform } from "../modules/platform/bootstrap.js";
import { createUserAccount, type CreateUserInput } from "../modules/platform/authService.js";

function parseFlag(name: string) {
  const entry = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  return entry ? entry.slice(name.length + 3).trim() : "";
}

function printUsage() {
  console.log(
    "Uso: npm run create:user -w @olist-crm/api -- --name=\"Nome\" --email=\"email@empresa.com\" --password=\"senha123\" --role=SELLER",
  );
}

function readInput(): CreateUserInput {
  const name = parseFlag("name");
  const email = parseFlag("email");
  const password = parseFlag("password");
  const role = parseFlag("role").toUpperCase();

  if (!name || !email || !password || !role) {
    printUsage();
    throw new Error("Parametros obrigatorios ausentes");
  }

  if (!["ADMIN", "MANAGER", "SELLER"].includes(role)) {
    throw new Error("Role invalido. Use ADMIN, MANAGER ou SELLER");
  }

  return {
    name,
    email,
    password,
    role: role as CreateUserInput["role"],
  };
}

async function main() {
  await bootstrapPlatform();
  const input = readInput();
  const createdUser = await createUserAccount(input);

  logger.info("internal user created", {
    id: String(createdUser.id),
    email: String(createdUser.email),
    role: String(createdUser.role),
  });

  console.log(
    `Usuario criado com sucesso: ${String(createdUser.name)} <${String(createdUser.email)}> [${String(createdUser.role)}]`,
  );
}

main()
  .then(async () => {
    await redis.quit();
    await pool.end();
  })
  .catch(async (error) => {
    logger.error("internal user creation failed", { error: String(error) });
    await redis.quit();
    await pool.end();
    process.exit(1);
  });
