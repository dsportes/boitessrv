CREATE TABLE IF NOT EXISTS "contact" (
	"ida"	TEXT,
	"idc"	TEXT,
	"dhc"	INTEGER,
	"datax"	TEXT,
	PRIMARY KEY("ida","idc")
);
CREATE INDEX "dhcida" ON "contact" (
	"dhc",
	"ida"
);
CREATE TABLE IF NOT EXISTS "avatar" (
	"ida"	TEXT,
	"dhc"	INTEGER,
	"dma"	INTEGER,
	"datax"	TEXT,
	PRIMARY KEY("ida")
);
CREATE INDEX "dmaa" ON "avatar" (
	"dma"
);
CREATE TABLE IF NOT EXISTS "compte" (
	"idc"	TEXT,
	"dhc"	INTEGER,
	"dma"	INTEGER,
	"dpbh"	TEXT UNIQUE,
	"data"	TEXT,
	"datax"	TEXT,
	PRIMARY KEY("idc")
);
CREATE UNIQUE INDEX "dpbh" ON "compte" (
	"dpbh"
);
CREATE INDEX "dmac" ON "compte" (
	"dma"
);
CREATE TABLE IF NOT EXISTS "groupe" (
	"idg"	TEXT,
	"dhc"	INTEGER,
	"dma"	INTEGER,
	"data"	TEXT,
	"datax"	TEXT,
	PRIMARY KEY("idg")
);
CREATE INDEX "dhcidg" ON "groupe" (
	"dhc",
	"idg"
);
CREATE TABLE IF NOT EXISTS "membre" (
	"idm"	TEXT,
	"idg"	TEXT,
	"dhc"	INTEGER,
	"datag"	TEXT,
	"datam"	TEXT,
	PRIMARY KEY("idm","idg")
);
CREATE INDEX "dhcidm" ON "membre" (
	"dhc",
	"idm"
);
CREATE INDEX "dhcidgm" ON "membre" (
	"dhc",
	"idg"
);
CREATE TABLE IF NOT EXISTS "dct" (
	"ida"	TEXT,
	"idc"	TEXT,
	"dhc"	INTEGER,
	"dlv"	INTEGER,
	"datac"	TEXT,
	PRIMARY KEY("ida","idc")
);
CREATE INDEX "dhcidadct" ON "dct" (
	"dhc",
	"ida"
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
	"ida"	TEXT,
	"idc"	TEXT,
	"idg"	TEXT,
	"dhc"	INTEGER,
	"dlv"	INTEGER,
	"datac"	TEXT,
	PRIMARY KEY("ida","idc", "idg")
    );
CREATE INDEX "dhcidainvg" ON "invg" (
	"dhc",
	"ida"
    );
CREATE INDEX "dhcidcinvg" ON "invg" (
	"dhc",
	"idc"
    );
CREATE INDEX "idcinvg" ON "invg" (
	"idc"
	);
CREATE TABLE IF NOT EXISTS "cext" (
	"dpbh"	TEXT,
	"ida"	TEXT,
	"dhc"	INTEGER,
	"dlv"	INTEGER,
	"pcbs"	TEXT,
	"datax"	TEXT,
	PRIMARY KEY("dpbh")
);
CREATE INDEX "idacext" ON "cext" (
	"ida"
);
CREATE TABLE IF NOT EXISTS "secret" (
	"ids"	TEXT,
	"idg"	TEXT,
	"bg"	TEXT,
	"suppr"	INTEGER,
	"dhc"	INTEGER,
	"cc"	TEXT,
	"mcg"	TEXT,
	"ida"	TEXT,
	"vs"	INTEGER,
	"vp"	INTEGER,
	"enta"	TEXT,
	"tcga"	BLOB,
	PRIMARY KEY("ids")
);
CREATE INDEX "asecret" ON "secret" (
	"ids",
	"dhc"
);
CREATE TABLE IF NOT EXISTS "secretcc" (
	"ida"	TEXT,
	"ids"	TEXT,
	"suppr"	INTEGER,
	PRIMARY KEY("ida","ids","suppr")
);
CREATE INDEX "gsecret" ON "secret" (
	"idg",
	"bg",
	"dhc",
	"suppr"
);
