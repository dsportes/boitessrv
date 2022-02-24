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

