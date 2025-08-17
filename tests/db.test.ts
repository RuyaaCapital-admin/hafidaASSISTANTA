import test from "node:test"
import assert from "node:assert/strict"

const DB_URL = "postgres://user:pass@localhost/db"

test("getDb throws when DATABASE_URL missing", () => {
  delete process.env.DATABASE_URL
  const { getDb } = require("../lib/db")
  assert.throws(() => getDb(), /DATABASE_URL is not set/)
})

test("getDb returns function when DATABASE_URL provided", () => {
  process.env.DATABASE_URL = DB_URL
  const { getDb } = require("../lib/db")
  const sql = getDb()
  assert.equal(typeof sql, "function")
})
