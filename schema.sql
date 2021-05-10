CREATE TABLE IF NOT EXISTS "contact" (
	"id"	TEXT,
	"idc"	TEXT,
	"dhc"	INTEGER,
	"datax"	TEXT,
	PRIMARY KEY("id","idc")
);
CREATE INDEX "dhcidcontact" ON "contact" (
	"dhc",
	"id"
);
CREATE TABLE IF NOT EXISTS "avatar" (
	"id"	TEXT,
	"dhc"	INTEGER,
	"dma"	INTEGER,
	"datax"	TEXT,
	PRIMARY KEY("id")
);
CREATE INDEX "dmaavatar" ON "avatar" (
	"dma"
);
CREATE TABLE IF NOT EXISTS "compte" (
	"id"	TEXT,
	"dhc"	INTEGER,
	"dma"	INTEGER,
	"dpbh"	TEXT UNIQUE,
	"data"	TEXT,
	"datax"	TEXT,
	PRIMARY KEY("id")
);
CREATE UNIQUE INDEX "dpbhcompte" ON "compte" (
	"dpbh"
);
CREATE INDEX "dmacompte" ON "compte" (
	"dma"
);
CREATE TABLE IF NOT EXISTS "groupe" (
	"id"	TEXT,
	"dhc"	INTEGER,
	"dma"	INTEGER,
	"data"	TEXT,
	"datax"	TEXT,
	PRIMARY KEY("id")
);
CREATE INDEX "dhcidgroupe" ON "groupe" (
	"dhc",
	"id"
);
CREATE TABLE IF NOT EXISTS "membre" (
	"id"	TEXT,
	"idg"	TEXT,
	"dhc"	INTEGER,
	"datax"	TEXT,
	"datay"	TEXT,
	PRIMARY KEY("id","idg")
);
CREATE INDEX "dhcidmembre" ON "membre" (
	"dhc",
	"id"
);
CREATE INDEX "dhcidgmembre" ON "membre" (
	"dhc",
	"idg"
);
CREATE TABLE IF NOT EXISTS "dct" (
	"id"	TEXT,
	"idc"	TEXT,
	"dhc"	INTEGER,
	"dlv"	INTEGER,
	"datac"	TEXT,
	PRIMARY KEY("id","idc")
);
CREATE INDEX "dhcidadct" ON "dct" (
	"dhc",
	"id"
);
CREATE INDEX "dhcidcdct" ON "dct" (
	"dhc",
	"idc"
);
CREATE INDEX "idcdct" ON "dct" (
	"idc"
);
CREATE INDEX "dlvdct" ON "dct" (
	"dlv"
);
CREATE TABLE IF NOT EXISTS "invg" (
	"id"	TEXT,
	"idc"	TEXT,
	"idg"	TEXT,
	"dhc"	INTEGER,
	"dlv"	INTEGER,
	"datac"	TEXT,
	PRIMARY KEY("id","idc", "idg")
    );
CREATE INDEX "dhcidinvg" ON "invg" (
	"dhc",
	"id"
    );
CREATE INDEX "dhcidcinvg" ON "invg" (
	"dhc",
	"idc"
    );
CREATE INDEX "idcinvg" ON "invg" (
	"idc"
	);
CREATE TABLE "cext" (
	"dpbh"	TEXT,
	"id"	TEXT,
	"dhc"	INTEGER,
	"dlv"	INTEGER,
	"pcbs"	TEXT,
	"datax"	TEXT,
	PRIMARY KEY("dpbh")
	);
	CREATE INDEX "iddpbhcext" ON "cext" (
	"id", "dpbh"
    );