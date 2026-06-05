import {
  pgTable,
  varchar,
  boolean,
  uuid,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const userTable = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),

  firstName: varchar("first_name", { length: 25 }),
  lastName: varchar("last_name", { length: 25 }),

  profileImageURL: text("profile_image_url"),

  email: varchar("email", { length: 25 }).notNull(),
  emailVerified: boolean("email_verified").default(false).notNull(),

  password: varchar("password", { length: 70 }),
  salt: text("salt"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
});

export const applicationTable = pgTable("application", {
  id: uuid("id").primaryKey().defaultRandom(),

  displayName: varchar("display_name", { length: 255 }).notNull(),

  client_id: text("client_id").notNull().unique(),
  client_secret: text("client_secret").notNull(),
  applicationUrl: text("application_url").notNull(),

  redirectUri: text("redirect_uri").notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const authorizationCodeTable = pgTable("authorization_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),

  userId: uuid("user_id").notNull(),
  client_id: text("client_id").notNull(),
  redirect_uri: text("redirect_uri").notNull(),

  nonce: text("nonce"),
  used: boolean("used").default(false).notNull(),

  expires_at: timestamp("expires_at").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});
