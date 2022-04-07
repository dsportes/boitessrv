salts : a été intégré dans les sources, module salts.mjs

Build webpack : npm run build

Résultat dans dist

Il faut y adjoindre le répertoire config/ (et un databases/)

    fulchain.pem
    privkey.pem
    favicon.ico
    config.json OU config.bin

Pour produire un config.bin (crypté) depuis un config.json :

    node cryptconfig.mjs


Test de delete subquery

    CREATE TABLE "av" (
      "id"	INTEGER,
      "nom"	TEXT,
      PRIMARY KEY("id")
    ) WITHOUT ROWID

    CREATE TABLE "cv" (
      "id"	INTEGER,
      "x"	INTEGER,
      "dds"	INTEGER,
      PRIMARY KEY("id")
    ) WITHOUT ROWID

    insert into av (id, nom) values (1, 'Duke');
    insert into av (id, nom) values (2, 'Basie');
    insert into av (id, nom) values (3, 'Dizzy');
    insert into cv (id, x, dds) values (1, 0, 14);
    insert into cv (id, x, dds) values (2, 0, 17);
    insert into cv (id, x, dds) values (3, 0, 24);

    delete from av where id in (select id from cv where dds < 20);
    update cv SET x = 1 where dds < 20;
