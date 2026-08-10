import pg from "pg";

const { Pool } = pg;

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export function createPool(
  config: DatabaseConfig
) {
  return new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password
  });
}