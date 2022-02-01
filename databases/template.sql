CREATE TABLE IF NOT EXISTS "versions" (
    "id"  INTEGER,
    "v"  BLOB,
    PRIMARY KEY("id")
    ) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "avgrvq" (
	"id"	INTEGER,
	"q1"	INTEGER,
	"q2"	INTEGER,
	"qm1"	INTEGER,
	"qm2"	INTEGER,
	"v1"	INTEGER,
	"v2"	INTEGER,
	"vm1"	INTEGER,
	"vm2"	INTEGER,
	"vsh"	INTEGER,
	PRIMARY KEY("id")
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "avrsa" (
	"id"	INTEGER,
	"clepub"	BLOB,
	"vsh"	INTEGER,
	PRIMARY KEY("id")
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "secret" (
	"id"	INTEGER,
	"ns"	INTEGER,
	"ic"	INTEGER,
	"v"	INTEGER,
	"st"	INTEGER,
	"ora"	INTEGER,
	"v1"	INTEGER,
	"v2"	INTEGER,
	"mc"	BLOB,
	"txts"	BLOB,
	"mpjs"	BLOB,
	"dups"	BLOB,
	"refs"	BLOB,
	"vsh"	INTEGER,
	PRIMARY KEY("id","ns")
);
CREATE INDEX "id_v_secret" ON "secret" (
	"id",
	"v"
);
CREATE TABLE IF NOT EXISTS "prefs" (
	"id"	INTEGER,
	"v"	INTEGER,
	"mapk"	BLOB,
	"vsh"	INTEGER,
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "compte" (
	"id"	INTEGER,
	"v"	INTEGER,
	"dds"	INTEGER,
	"dpbh"	INTEGER,
	"pcbh"	INTEGER,
	"kx"	BLOB,
	"mack"	BLOB,
	"vsh"	INTEGER,
	PRIMARY KEY("id")
) WITHOUT ROWID;
CREATE INDEX "dds_compte" ON "compte" (
	"dds"
);
CREATE UNIQUE INDEX "dpbh_compte" ON "compte" (
	"dpbh"
);
CREATE TABLE IF NOT EXISTS "avatar" (
	"id"	INTEGER,
	"v"	INTEGER,
	"st"	INTEGER,
	"vcv"	INTEGER,
	"dds"	INTEGER,
	"cva"	BLOB,
	"lgrk"	BLOB,
	"vsh"	INTEGER,
	PRIMARY KEY("id")
) WITHOUT ROWID;
CREATE INDEX "dds_avatar" ON "avatar" (
	"dds"
);
CREATE INDEX "id_v_avatar" ON "avatar" (
	"id",
	"v"
);
CREATE INDEX "id_vcv_avatar" ON "avatar" (
	"id",
	"vcv"
);
CREATE TABLE IF NOT EXISTS "contact" (
	"id"	INTEGER,
	"ic"	INTEGER,
	"v"	INTEGER,
	"st"	INTEGER,
	"q1"	REAL,
	"q2"	INTEGER,
	"qm1"	INTEGER,
	"qm2"	INTEGER,
	"ardc"	BLOB,
	"datap"	BLOB,
	"datak"	BLOB,
	"mc"	BLOB,
	"infok"	BLOB,
	"vsh"	INTEGER,
	PRIMARY KEY("id","ic")
);
CREATE INDEX "id_v_contact" ON "contact" (
	"id",
	"v"
);
CREATE TABLE IF NOT EXISTS "rencontre" (
	"prh"	INTEGER,
	"id"	INTEGER,
	"v"	INTEGER,
	"dlv"	INTEGER,
	"st"	INTEGER,
	"datak"	BLOB,
	"nomax"	BLOB,
	"nombx"	BLOB,
	"vsh"	INTEGER,
	PRIMARY KEY("prh")
) WITHOUT ROWID;
CREATE INDEX "dlv_rencontre" ON "rencontre" ( "dlv" );
CREATE INDEX "id_rencontre" ON "rencontre" ( "id" );
CREATE TABLE IF NOT EXISTS "invitgr" (
	"id"	INTEGER,
	"ni"	INTEGER,
	"datap"	BLOB,
	PRIMARY KEY("id","ni")
);
CREATE TABLE IF NOT EXISTS "membre" (
	"id"	INTEGER,
	"im"	INTEGER,
	"v"	INTEGER,
	"st"	INTEGER,
	"vote"	INTEGER,
	"q1"	INTEGER,
	"q2"	INTEGER,
	"mc"	BLOB,
	"infok"	BLOB,
	"datag"	BLOB,
	"ardg"	BLOB,
	"vsh"	INTEGER,
	PRIMARY KEY("id","im")
);
CREATE INDEX "id_v_membre" ON "membre" ( "id", "v" );
CREATE INDEX "st_avatar" ON "avatar" (
	"st"
) WHERE "st" < 0;
CREATE INDEX "st_contact" ON "contact" (
	"st"
) WHERE "st" < 0;
CREATE INDEX "st_membre" ON "membre" (
	"st"
) WHERE st < 0;
CREATE INDEX "st_secret" ON "secret" (
	"st"
) WHERE "st" < 0;
CREATE TABLE IF NOT EXISTS "groupe" (
	"id"	INTEGER,
	"v"	INTEGER,
	"dds"	INTEGER,
	"st"	INTEGER,
	"stxy"	INTEGER,
	"cvg"	BLOB,
	"mcg"	BLOB,
	"vsh"	INTEGER,
	PRIMARY KEY("id")
) WITHOUT ROWID;
CREATE INDEX "dds_groupe" ON "groupe" ( "dds" );
CREATE INDEX "id_v_groupe" ON "groupe" ( "id", "v" );
CREATE INDEX "st_groupe" ON "groupe" (
	"st"
) WHERE st < 0;
CREATE TABLE IF NOT EXISTS "parrain" (
	"pph"	INTEGER,
	"id"	INTEGER,
	"v"	INTEGER,
	"dlv"	INTEGER,
	"st"	REAL,
	"q1"	INTEGER,
	"q2"	INTEGER,
	"qm1"	INTEGER,
	"qm2"	INTEGER,
	"datak"	BLOB,
	"datax"	BLOB,
	"data2k"	BLOB,
	"ardc"	BLOB,
	"vsh"	INTEGER,
	PRIMARY KEY("pph")
) WITHOUT ROWID;
CREATE INDEX "dlv_parrain" ON "parrain" (
	"dlv"
);
CREATE INDEX "id_parrain" ON "parrain" (
	"id"
);
