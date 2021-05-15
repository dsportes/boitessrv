CREATE TABLE IF NOT EXISTS "carte" (
	"id"	INTEGER,
	"dhc"	INTEGER,
	"datax"	TEXT,
	PRIMARY KEY("id")
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "contact" (
	"ida"	INTEGER,
	"idb"	INTEGER,
	"dhc"	INTEGER,
	"data"	TEXT,
	"dataa"	TEXT,
	"datab"	TEXT
);
CREATE TABLE IF NOT EXISTS "membre" (
	"ida"	INTEGER,
	"idg"	INTEGER,
	"dhc"	INTEGER,
	"q1"	INTEGER,
	"q2"	INTEGER,
	"dataa"	TEXT,
	"datag"	TEXT
);
CREATE TABLE IF NOT EXISTS "dct" (
	"ida"	INTEGER,
	"idb"	INTEGER,
	"dhc"	INTEGER,
	"dlv"	INTEGER,
	"datab"	TEXT
);
CREATE TABLE IF NOT EXISTS "invg" (
	"ida"	INTEGER,
	"idb"	INTEGER,
	"idg"	INTEGER,
	"dhc"	INTEGER,
	"dlv"	INTEGER,
	"datab"	TEXT
);
CREATE TABLE IF NOT EXISTS "cext" (
	"id"	INTEGER,
	"dpbh"	INTEGER,
	"ida"	INTEGER,
	"dhc"	INTEGER,
	"dlv"	INTEGER,
	"pbcs"	TEXT,
	"datax"	TEXT,
	PRIMARY KEY("id")
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "quotas" (
	"id"	INTEGER,
	"q1"	INTEGER,
	"q2"	INTEGER,
	"qm1"	INTEGER,
	"qm2"	INTEGER,
	PRIMARY KEY("id")
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "etat" (
	"id"	INTEGER,
	"dhc"	INTEGER,
	"data"	TEXT,
	PRIMARY KEY("id")
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "cptvq" (
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
CREATE TABLE IF NOT EXISTS "compte" (
	"id"	INTEGER,
	"dhc"	INTEGER,
	"dpbh"	INTEGER,
	"pbcs"	TEXT,
	"datax"	TEXT,
	PRIMARY KEY("id")
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "avatar" (
	"id"	INTEGER,
	"dhc"	INTEGER,
	"suppr"	INTEGER,
	"lc"	TEXT,
	"lg"	TEXT,
	"data"	TEXT,
	PRIMARY KEY("id")
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "groupe" (
	"id"	INTEGER,
	"dhc"	INTEGER,
	"suppr"	INTEGER,
	"lm"	TEXT,
	"ferme"	INTEGER,
	"arch"	INTEGER,
	"datax"	TEXT,
	PRIMARY KEY("id")
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "secret" (
	"id"	INTEGER,
	"dhc"	INTEGER,
	"v1"	INTEGER,
	"v2"	INTEGER,
	"dataa"	TEXT,
	"texte"	TEXT,
	PRIMARY KEY("id")
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS "secref" (
	"id"	INTEGER,
	"idb"	INTEGER,
	"dhc"	INTEGER,
	"suppr"	INTEGER,
	"ncax"	TEXT,
	"perm"	INTEGER,
	"mc"	TEXT
);
CREATE INDEX "dhc_carte" ON "carte" (
	"dhc"
);
CREATE INDEX "ida_dhc_contact" ON "contact" (
	"ida",
	"dhc"
);
CREATE INDEX "idb_dhc_contact" ON "contact" (
	"idb",
	"dhc"
);
CREATE INDEX "ida_dhc_idg_membre" ON "membre" (
	"ida",
	"dhc",
	"idg"
);
CREATE INDEX "idg_dhc_ida_membre" ON "membre" (
	"idg",
	"dhc",
	"ida"
);
CREATE INDEX "ida_dhc_dct" ON "dct" (
	"ida",
	"dhc"
);
CREATE INDEX "idb_dhc_dct" ON "dct" (
	"idb",
	"dhc"
);
CREATE INDEX "dlv_dct" ON "dct" (
	"dlv"
);
CREATE INDEX "idg_dhc_invg" ON "invg" (
	"idg",
	"dhc"
);
CREATE INDEX "idb_dhc_invg" ON "invg" (
	"idb",
	"dhc"
);
CREATE INDEX "dlv_invg" ON "invg" (
	"dlv"
);
CREATE INDEX "dpbh" ON "cext" (
	"dpbh"
);
CREATE INDEX "ida_dhc_cext" ON "cext" (
	"ida",
	"dhc"
);
CREATE INDEX "dlv_cext" ON "cext" (
	"dlv"
);
CREATE UNIQUE INDEX "dhc_compte" ON "compte" (
	"dhc"
);
CREATE UNIQUE INDEX "dpbh_compte" ON "compte" (
	"dpbh"
);
CREATE INDEX "dhc_suppr_avatar" ON "avatar" (
	"dhc",
	"suppr"
);
CREATE INDEX "dhc_suppr_groupe" ON "groupe" (
	"dhc",
	"suppr"
);
CREATE INDEX "id_dhc_secret" ON "secret" (
	"id",
	"dhc"
);
CREATE INDEX "id_suppr_secref" ON "secref" (
	"id",
	"suppr"
);
CREATE INDEX "idb_dhc_id_secref" ON "secref" (
	"idb",
	"dhc",
	"suppr",
	"id"
);
CREATE INDEX "perm_id_secref" ON "secref" (
	"perm",
	"suppr",
	"id"
);
