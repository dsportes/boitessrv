@echo off
sqlite3 databases\template.db3 .schema > databases\template.sql
