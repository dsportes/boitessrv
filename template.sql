CREATE TABLE "avatar" (
    "id"   INTEGER,
    "v"  	INTEGER,
    "st"  INTEGER,
    "vcv" INTEGER,
    "dds" INTEGER,
    "cva"	BLOB,
    "lctk" BLOB,
    PRIMARY KEY("id")
    ) WITHOUT ROWID;

CREATE TABLE "avgrvq" (
    "id"	INTEGER,
    "q1"	INTEGER,
    "q2"	INTEGER,
    "qm1"	INTEGER,
    "qm2"	INTEGER,
    "v1"	INTEGER,
    "v2"	INTEGER,
    "vm1"	INTEGER,
    "vm2"	INTEGER,
    PRIMARY KEY("id")
    ) WITHOUT ROWID;

CREATE TABLE "avrsa" (
    "id"	INTEGER,
    "clepub"	BLOB,
    PRIMARY KEY("id")
    ) WITHOUT ROWID;

CREATE TABLE "compte" (
    "id"	INTEGER,
    "v"		INTEGER,
    "dds" INTEGER,
    "dpbh"	INTEGER,
    "pcbh"	INTEGER,
    "kx"   BLOB,
    "mack"  BLOB,
    "mmck"	BLOB,
    PRIMARY KEY("id")
    ) WITHOUT ROWID;

CREATE TABLE "contact" (
    "id"   INTEGER,
    "ic"	INTEGER,
    "v"  	INTEGER,
    "st" INTEGER,
    "q1" INTEGER,
    "q2" INTEGER,
    "qm1" INTEGER,
    "qm2" INTEGER,
    "ardc"	BLOB,
    "icbc"  BLOB
    "datak"	BLOB,
    PRIMARY KEY("id", "ic")
    );

CREATE TABLE "etat" ("data"	BLOB);

CREATE TABLE "groupe" (
    "id"  INTEGER,
    "v"   INTEGER,
    "dds" INTEGER,
    "st"  INTEGER,
    "cvg"  BLOB,
    "mcg"   BLOB,
    "lstmg" BLOB,
    PRIMARY KEY("id")
    ) WITHOUT ROWID;

CREATE TABLE "invitct" (
    "cch" INTEGER,
    "id"  INTEGER,
    "dlv"	INTEGER,
    "st"  INTEGER,
    "ccpub" BLOB,
    "datac"  BLOB,
    "ardc"  BLOB,
    PRIMARY KEY ("cch"))
    WITHOUT ROWID;

CREATE TABLE "invitgr" (
    "niv" INTEGER,
    "id"  INTEGER,
    "v"   INTEGER,
    "dlv"	INTEGER,
    "st"  INTEGER,
    "datap" BLOB,
    "datak" BLOB,
    "clek"  BLOB,
    PRIMARY KEY ("niv")
    ) WITHOUT ROWID;

CREATE TABLE "membre" (
    "id"  INTEGER,
    "im"	INTEGER,
    "v"		INTEGER,
    "st"	INTEGER,
    "vote"  INTEGER,
    "dlv"   INTEGER,
    "datag"	BLOB,
    "ardg"  BLOB,
    PRIMARY KEY("id", "im"));

CREATE TABLE "parrain" (
    "pph"  INTEGER,
    "id" INTEGER,
    "nc" INTEGER,  
    "dlv"  INTEGER,
    "st"  INTEGER,
    "q1" INTEGER,
    "q2" INTEGER,
    "qm1" INTEGER,
    "qm2" INTEGER,
    "datak"  BLOB,
    "datax"  BLOB,
    "ardc"  BLOB,
    PRIMARY KEY("pph")
    ) WITHOUT ROWID;

CREATE TABLE "rencontre" (
    "prh" INTEGER,
    "id" INTEGER,
    "v"   INTEGER,
    "dlv" INTEGER,
    "st"  INTEGER,
    "datak" BLOB,
    "nomcx" BLOB,
    PRIMARY KEY("prh")
    ) WITHOUT ROWID;

CREATE TABLE "secret" (
    "ids"  INTEGER,
    "id"  INTEGER,
    "ic"  INTEGER,
    "v"		INTEGER,
    "st"	INTEGER,
    "txts"	BLOB,
    "mcs"   BLOB,
    "aps"	BLOB,
    "dups"	BLOB,
    PRIMARY KEY("ids")
    ) WITHOUT ROWID;

CREATE TABLE "versions" (
    "id"  INTEGER,
    "v"  BLOB,
    PRIMARY KEY("id")
    ) WITHOUT ROWID;

CREATE INDEX "dds_avatar" ON "avatar" ( "dds" );
CREATE INDEX "dlv_invitct" ON "invitct" ( "dlv" );
CREATE INDEX "dlv_invitgr" ON "invitgr" ( "dlv" );
CREATE INDEX "dlv_parrain" ON "parrain" ( "dlv" );
CREATE INDEX "dlv_rencontre" ON "rencontre" ( "dlv" );
CREATE UNIQUE INDEX "dpbh_compte" ON "compte" ( "dpbh" );
CREATE INDEX "id_invitct" ON "invitct" ( "id" );
CREATE INDEX "id_invitgr" ON "invitgr" ( "id" );
CREATE INDEX "id_parrain" ON "parrain" ( "id" );
CREATE INDEX "id_rencontre" ON "rencontre" ( "id" );
CREATE INDEX "id_v_avatar" ON "avatar" ( "id", "v" );
CREATE INDEX "id_v_contact" ON "contact" ( "id", "v" );
CREATE INDEX "id_v_groupe" ON "groupe" ( "id", "v" );
CREATE INDEX "id_v_membre" ON "membre" ( "id", "v" );
CREATE INDEX "id_v_secret" ON "secret" ("id", "v");
CREATE INDEX "id_vcv_avatar" ON "avatar" ( "id", "vcv");
CREATE INDEX "st_secret" ON "secret" ( "st" );

