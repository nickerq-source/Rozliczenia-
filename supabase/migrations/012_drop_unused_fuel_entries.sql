-- Usunięcie NIEUŻYWANEJ tabeli fuel_entries.
--
-- Dlaczego: tankowania kierowcy są przechowywane w workspaces.data (JSONB) i
-- obsługiwane przez trasy service-role (/api/driver/fuel) z kontrolą roli.
-- Tabela fuel_entries (utworzona w 001, rozbudowana w 010/011 o status/mileage/
-- RLS/trigger) NIGDY nie jest używana przez kod aplikacji — to martwa
-- infrastruktura, której RLS i trigger mylą przy audytach bezpieczeństwa.
-- Zweryfikowano: tabela ma 0 wierszy, więc usunięcie nic nie traci.
--
-- DROP TABLE ... CASCADE usuwa też polityki RLS, indeksy i trigger tej tabeli.
-- Funkcja-strażnik jest osobnym obiektem — usuwamy ją jawnie. Wspólnych
-- funkcji RLS (get_user_role/get_driver_id/get_user_workspace) NIE ruszamy.

DROP TABLE IF EXISTS fuel_entries CASCADE;
DROP FUNCTION IF EXISTS guard_driver_fuel_pending_update();
