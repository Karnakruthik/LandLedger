package in.landledger.registry;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class RegistryRepository {
  private final JdbcTemplate jdbc;

  RegistryRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  List<Map<String, Object>> rows(String sql, Object... args) {
    return jdbc.query(
        sql,
        (rs, n) -> {
          Map<String, Object> row = new LinkedHashMap<>();
          var meta = rs.getMetaData();
          for (int i = 1; i <= meta.getColumnCount(); i++)
            row.put(meta.getColumnLabel(i).toLowerCase(Locale.ROOT), rs.getObject(i));
          return row;
        },
        args);
  }

  Map<String, Object> one(String sql, Object... args) {
    return rows(sql, args).stream().findFirst().orElse(Map.of());
  }

  byte[] document(String id) {
    return jdbc.queryForObject("SELECT document FROM properties WHERE id=?", byte[].class, id);
  }

  int update(String sql, Object... args) {
    return jdbc.update(sql, args);
  }

  long count(String sql, Object... args) {
    return jdbc.queryForObject(sql, Long.class, args);
  }

  Account account(String id) {
    var r = one("SELECT id,name,email,role,wallet FROM accounts WHERE id=?", id);
    if (r.isEmpty()) throw Problems.unauthorized();
    return new Account(
        id,
        (String) r.get("name"),
        (String) r.get("email"),
        (String) r.get("role"),
        (String) r.get("wallet"));
  }
}

record Account(String id, String name, String email, String role, String wallet) {
  boolean admin() {
    return "ADMIN".equals(role);
  }

  void requireWallet() {
    if (wallet == null) throw Problems.bad("Link your wallet first.");
  }
}
