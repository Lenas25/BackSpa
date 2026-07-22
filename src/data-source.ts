import 'dotenv/config';
import { DataSource } from 'typeorm';

// Standalone TypeORM DataSource used exclusively by the TypeORM CLI
// (migration:generate / migration:run / migration:revert).
// Nest's runtime DataSource is configured separately in app.module.ts.
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number.parseInt(process.env.DB_PORT) : 5432,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [`${__dirname}/**/*.entity{.ts,.js}`],
  migrations: [`${__dirname}/migrations/*{.ts,.js}`],
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});
