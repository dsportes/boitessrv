CREATE TABLE IF NOT EXISTS "versions" (
    "id"  INTEGER,
    "v"  BLOB,
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
	"v"	INTEGER,
	"st"	INTEGER,
	"xp"	INTEGER,
	"v1"	INTEGER,
	"v2"	INTEGER,
	"mc"	BLOB,
	"txts"	BLOB,
	"mfas"	BLOB,
	"refs"	BLOB,
	"vsh"	INTEGER,
	PRIMARY KEY("id","ns")
);
CREATE INDEX "id_v_secret" ON "secret" (
	"id",
	"v"
);
CREATE TABLE IF NOT EXISTS "avatar" (
	"id"	INTEGER,
	"v"	INTEGER,
	"lgrk"	BLOB,
  "lcck"  BLOB,
	"vsh"	INTEGER,
	PRIMARY KEY("id")
) WITHOUT ROWID;
CREATE INDEX "id_v_avatar" ON "avatar" (
	"id",
	"v"
);
CREATE TABLE IF NOT EXISTS "invitgr" (
	"id"	INTEGER,
	"ni"	INTEGER,
	"datap"	BLOB,
	PRIMARY KEY("id","ni")
);
CREATE TABLE IF NOT EXISTS "prefs" (
	"id"	INTEGER,
	"v"	INTEGER,
	"mapk"	BLOB,
	"vsh"	INTEGER,
	PRIMARY KEY("id")
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "compta" (
	"id"	INTEGER,
	"idp"	INTEGER,
	"v"	INTEGER,
	"dds"	INTEGER,
	"st"	INTEGER,
	"dst"	INTEGER,
	"data"	BLOB,
  "dh" INTEGER,
  "ard" BLOB,
	"vsh"	INTEGER,
	PRIMARY KEY("id")
) WITHOUT ROWID;
CREATE INDEX "idp_compta" ON "compta" (
	"idp"
);
CREATE INDEX "st_compta" ON "compta" (
	"st"
) WHERE "st" > 0;
CREATE INDEX "dds_compta" ON "compta" (
	"dds"
);
CREATE TABLE IF NOT EXISTS "contact" (
  "phch"   INTEGER,
  "dlv"	INTEGER,
  "ccx"  BLOB,
  "vsh" INTEGER,
  PRIMARY KEY("phch"));
CREATE INDEX "dlv_contact" ON "contact" ( "dlv" );
CREATE TABLE IF NOT EXISTS "membre" (
	"id"	INTEGER,
	"im"	INTEGER,
	"v"	INTEGER,
	"st"	INTEGER,
	"vote"	INTEGER,
	"mc"	BLOB,
	"infok"	BLOB,
	"datag"	BLOB,
	"ardg"	BLOB,
	"vsh"	INTEGER,
	PRIMARY KEY("id","im")
);
CREATE INDEX "id_v_membre" ON "membre" (
	"id",
	"v"
);
CREATE TABLE IF NOT EXISTS "compte" (
  "id"	INTEGER,
  "v"		INTEGER,
  "dpbh"	INTEGER,
  "pcbh"	INTEGER,
  "kx"   BLOB,
  "mack"  BLOB,
  "vsh"	INTEGER,
	PRIMARY KEY("id")
) WITHOUT ROWID;
CREATE UNIQUE INDEX "dpbh_compte" ON "compte" (
	"dpbh"
);
CREATE TABLE IF NOT EXISTS "couple" (
    "id"   INTEGER,
    "v"  	INTEGER,
    "st" INTEGER,
    "v1"  INTEGER,
    "v2"  INTEGER,
    "mx10"  INTEGER,
    "mx20"  INTEGER,
    "mx11"  INTEGER,
    "mx21"  INTEGER,
    "dlv"	INTEGER,
    "datac"  BLOB,
    "infok0"	BLOB,
    "infok1"	BLOB,
    "mc0"	BLOB,
    "mc1"  BLOB,
    "ardc"	BLOB,
    "vsh"	INTEGER,
    PRIMARY KEY("id")
    ) WITHOUT ROWID;
CREATE INDEX "id_v_couple" ON "couple" ( "id", "v" );
CREATE TABLE IF NOT EXISTS "groupe" (
	"id"	INTEGER,
	"v"	INTEGER,
	"dfh"	INTEGER,
	"st"	INTEGER,
  "mxim"  INTEGER,
	"idhg"	BLOB,
	"imh"	INTEGER,
	"v1"	INTEGER,
	"v2"	INTEGER,
	"f1"	INTEGER,
	"f2"	INTEGER,
	"mcg"	BLOB,
	"vsh"	INTEGER,
	PRIMARY KEY("id")
) WITHOUT ROWID;
CREATE INDEX "id_v_groupe" ON "groupe" (
	"id",
	"v"
);
CREATE INDEX "dfh_groupe" ON "groupe" ( "dfh" ) WHERE "dfh" > 0;
CREATE TABLE IF NOT EXISTS "repertoire" (
  "id"	INTEGER,
  "v" INTEGER,
  "x" INTEGER,
  "dds" INTEGER,
  "cv"	BLOB,
  "vsh" INTEGER,
  PRIMARY KEY("id")
  ) WITHOUT ROWID;
CREATE INDEX "id_v_repertoire" ON "repertoire" ( "id", "v");
CREATE INDEX "dds_repertoire" ON "repertoire" ( "dds" ) WHERE "dds" > 0;
CREATE INDEX "x_repertoire" ON "repertoire" ( "x" ) WHERE "x" = 1;
