-- CreateTable
CREATE TABLE "mobile_clients" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "mobile_clients_apiKey_key" ON "mobile_clients"("apiKey");

-- CreateIndex
CREATE INDEX "mobile_clients_apiKey_idx" ON "mobile_clients"("apiKey");

-- CreateIndex
CREATE INDEX "mobile_clients_platform_idx" ON "mobile_clients"("platform");
