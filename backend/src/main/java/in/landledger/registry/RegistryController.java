package in.landledger.registry;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.http.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

record Decision(@NotBlank @Size(max = 300) String reason) {}

record Recipient(@NotBlank @Pattern(regexp = "0x[0-9a-fA-F]{40}") String wallet) {}

@RestController
@RequestMapping("/api")
class RegistryController {
  final RegistryRepository db;
  final PropertyService land;
  final ChainGateway chain;
  final ChainIndex index;

  RegistryController(
      RegistryRepository db, PropertyService land, ChainGateway chain, ChainIndex index) {
    this.db = db;
    this.land = land;
    this.chain = chain;
    this.index = index;
  }

  @GetMapping("/public/config")
  Object config() {
    try {
      var c = chain.get("/config");
      var binding = db.one("SELECT deployment FROM chain_cursor WHERE id=1").get("deployment");
      if (binding != null
          && !binding.equals(
              c.get("chainId").asText()
                  + ":"
                  + c.get("address").asText().toLowerCase(Locale.ROOT)
                  + ":"
                  + c.get("deploymentBlockHash").asText())) return Map.of("available", false);
      return c;
    } catch (RuntimeException e) {
      return Map.of("available", false);
    }
  }

  @GetMapping("/public/stats")
  Object stats() {
    return Map.of(
        "properties",
        db.count("SELECT COUNT(*) FROM properties"),
        "approved",
        db.count("SELECT COUNT(*) FROM properties WHERE status='APPROVED'"),
        "verified",
        db.count("SELECT COUNT(*) FROM properties WHERE last_verification='VERIFIED'"),
        "transfers",
        db.count("SELECT COUNT(*) FROM chain_events WHERE kind='TransferApproved'"),
        "transactions",
        db.count("SELECT COUNT(DISTINCT tx_hash) FROM chain_events"));
  }

  @GetMapping("/public/history")
  Object history(
      @RequestParam(required = false) String id, @RequestParam(defaultValue = "0") int page) {
    long offset = (long) Math.max(0, page) * 50;
    String sql = "SELECT * FROM chain_events ";
    return id == null
        ? db.rows(sql + "ORDER BY block_number DESC,log_index DESC LIMIT 50 OFFSET ?", offset)
        : db.rows(
            sql + "WHERE property_id=? ORDER BY block_number DESC,log_index DESC LIMIT 50 OFFSET ?",
            id,
            offset);
  }

  @GetMapping("/public/verify/{id}")
  Object verify(@PathVariable String id, @RequestAttribute(required = false) Account account) {
    id = id.toUpperCase(Locale.ROOT);
    if (!id.matches("[A-Z0-9-]{1,40}")) throw Problems.bad("Enter a valid property ID.");
    var p =
        db.one(
            "SELECT id,status,owner_wallet,location,state,district,survey,area,property_type,tx_hash,block_number FROM properties WHERE id=?",
            id);
    Map<String, Object> result = new LinkedHashMap<>();
    String state = "NOT_FOUND";
    if (!p.isEmpty() && !Set.of("PENDING", "REJECTED").contains(p.get("status"))) {
      var network = config();
      if (!(network instanceof com.fasterxml.jackson.databind.JsonNode)) throw Problems.offline();
      if (!index.sync()) return Map.of("result", "SYNCHRONIZING");
      p =
          db.one(
              "SELECT id,status,owner_wallet,location,state,district,survey,area,property_type,tx_hash,block_number FROM properties WHERE id=?",
              id);
      long block = db.count("SELECT next_block FROM chain_cursor WHERE id=1") - 1;
      if (block < ((com.fasterxml.jackson.databind.JsonNode) network).get("startBlock").asLong())
        return Map.of("result", "CONFIRMING");
      var record = chain.get("/record?id=" + id + "&block=" + block);
      String digest = land.digest(id);
      boolean exists = !record.get("owner").asText().equals("0x" + "0".repeat(40));
      if (exists || p.get("tx_hash") != null) {
        state =
            exists
                    && "APPROVED".equals(p.get("status"))
                    && digest.equals(record.get("digest").asText())
                    && p.get("owner_wallet").equals(record.get("owner").asText())
                ? "VERIFIED"
                : "MISMATCH";
        result.put("property", p);
        result.put("digest", digest);
        result.put("chainDigest", record.get("digest").asText());
        result.put("wallet", record.get("owner").asText());
        if ("READY".equals(p.get("status")) && exists) state = "CONFIRMING";
        db.update(
            "UPDATE properties SET last_verification=? WHERE id=? AND owner_wallet=?",
            state,
            id,
            p.get("owner_wallet"));
      }
    }
    result.put("result", state);
    if (account != null && account.role().equals("BUYER"))
      db.update(
          "INSERT INTO verification_history(account_id,property_id,result,viewed_at) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE result=?,viewed_at=?",
          account.id(),
          id,
          state,
          System.currentTimeMillis(),
          state,
          System.currentTimeMillis());
    return result;
  }

  @PostMapping("/properties")
  Object submit(
      @RequestAttribute Account account,
      @Valid @RequestPart LandApplication details,
      @RequestPart MultipartFile document)
      throws IOException {
    return Map.of("id", land.submit(account, details, document));
  }

  @GetMapping("/properties")
  Object properties(@RequestAttribute Account account) {
    String q = "SELECT " + PropertyService.FIELDS + " FROM properties ";
    return account.admin()
        ? db.rows(q + "ORDER BY created_at DESC")
        : db.rows(
            q + "WHERE owner_wallet=? OR applicant=? ORDER BY created_at DESC",
            account.wallet(),
            account.id());
  }

  @GetMapping("/properties/{id}")
  Object detail(@PathVariable String id, @RequestAttribute Account account) {
    var p = land.detail(id);
    if (!land.entitled(account, p)) throw Problems.denied();
    if (account.admin())
      p.put(
          "identity_ref",
          db.one("SELECT identity_ref FROM properties WHERE id=?", id).get("identity_ref"));
    return p;
  }

  @GetMapping("/properties/{id}/document")
  ResponseEntity<byte[]> document(@PathVariable String id, @RequestAttribute Account account) {
    if (!land.entitled(account, land.detail(id))) throw Problems.denied();
    return ResponseEntity.ok()
        .header("Content-Disposition", "attachment; filename=\"" + id + ".pdf\"")
        .header("Content-Security-Policy", "sandbox")
        .contentType(MediaType.APPLICATION_OCTET_STREAM)
        .body(land.document(id));
  }

  @GetMapping("/properties/{id}/certificate")
  ResponseEntity<byte[]> certificate(@PathVariable String id, @RequestAttribute Account account) {
    var p = land.detail(id);
    if (!land.entitled(account, p)) throw Problems.denied();
    var proof = (Map<?, ?>) verify(id, null);
    if (!"VERIFIED".equals(proof.get("result")))
      throw Problems.bad("The current record must pass blockchain verification.");
    String cert =
        "LANDLEDGER  |  REGISTRATION CERTIFICATE\nAcademic land registry\n\nProperty ID  "
            + id
            + "\nLocation  "
            + p.get("location")
            + ", "
            + p.get("district")
            + ", "
            + p.get("state")
            + "\nSurvey  "
            + p.get("survey")
            + "\nArea (m²)  "
            + p.get("area")
            + "\nCurrent wallet  "
            + proof.get("wallet")
            + "\nRegistration digest  "
            + proof.get("digest")
            + "\nTitle transaction  "
            + p.get("tx_hash")
            + "\nBlock  "
            + p.get("block_number")
            + "\nIssued  "
            + java.time.Instant.now()
            + "\nVerify the current title using the property ID in LandLedger.";
    return ResponseEntity.ok()
        .header("Content-Disposition", "attachment; filename=\"" + id + "-certificate.txt\"")
        .contentType(MediaType.TEXT_PLAIN)
        .body(cert.getBytes(StandardCharsets.UTF_8));
  }

  @PostMapping("/properties/{id}/reject")
  Object reject(
      @PathVariable String id,
      @RequestAttribute Account account,
      @Valid @RequestBody Decision input) {
    if (!account.admin()) throw Problems.denied();
    if (db.update(
            "UPDATE properties SET status='REJECTED',review_note=? WHERE id=? AND status='PENDING'",
            input.reason(),
            id)
        != 1) throw Problems.bad("Only pending applications can be rejected.");
    return Map.of("status", "REJECTED");
  }

  @Transactional
  @PostMapping("/properties/{id}/approve")
  Object approve(@PathVariable String id, @RequestAttribute Account account) {
    requireAdminWallet(account);
    db.one("SELECT id FROM properties WHERE id=? FOR UPDATE", id);
    var p = land.detail(id);
    if (!Set.of("PENDING", "READY").contains(p.get("status")))
      throw Problems.bad("Application already reviewed.");
    db.update("UPDATE properties SET status='READY' WHERE id=?", id);
    return Map.of("id", id, "wallet", p.get("initial_wallet"), "digest", "0x" + land.digest(id));
  }

  void requireAdminWallet(Account account) {
    if (!account.admin()) throw Problems.denied();
    account.requireWallet();
    var c = config();
    if (!(c instanceof com.fasterxml.jackson.databind.JsonNode n)) throw Problems.offline();
    if (!account.wallet().equalsIgnoreCase(n.get("administrator").asText()))
      throw Problems.bad("Link the contract administrator wallet to review this transaction.");
  }

  @PostMapping("/chain/sync")
  Object sync() {
    index.sync();
    return Map.of("synced", true);
  }

  @PostMapping("/properties/{id}/recipient")
  Object recipient(
      @PathVariable String id,
      @RequestAttribute Account account,
      @Valid @RequestBody Recipient input) {
    account.requireWallet();
    var p = land.detail(id);
    if (!account.wallet().equals(p.get("owner_wallet")) || !"APPROVED".equals(p.get("status")))
      throw Problems.denied();
    String wallet = input.wallet().toLowerCase(Locale.ROOT);
    if (wallet.equals(account.wallet())
        || db.count(
                "SELECT COUNT(*) FROM accounts WHERE wallet=? AND role IN ('BUYER','LANDOWNER')",
                wallet)
            == 0) throw Problems.bad("Use a different buyer or landowner's linked wallet.");
    return Map.of("wallet", wallet);
  }

  @PostMapping("/properties/{id}/request")
  Object request(@PathVariable String id, @RequestAttribute Account account) {
    account.requireWallet();
    if (!"BUYER".equals(account.role())) throw Problems.denied();
    var p = land.detail(id);
    if (!"APPROVED".equals(p.get("status")) || account.wallet().equals(p.get("owner_wallet")))
      throw Problems.bad("Choose an approved property owned by another account.");
    db.update(
        "INSERT INTO purchase_requests(property_id,buyer,seller_wallet,status,created_at) VALUES(?,?,?,'REQUESTED',?) ON DUPLICATE KEY UPDATE seller_wallet=?,status='REQUESTED',created_at=?",
        id,
        account.id(),
        p.get("owner_wallet"),
        System.currentTimeMillis(),
        p.get("owner_wallet"),
        System.currentTimeMillis());
    return Map.of("status", "REQUESTED");
  }

  @GetMapping("/requests")
  Object requests(@RequestAttribute Account account) {
    String q =
        "SELECT r.*,a.wallet AS buyer_wallet FROM purchase_requests r JOIN accounts a ON a.id=r.buyer ";
    return account.admin()
        ? db.rows(q + "ORDER BY r.created_at DESC")
        : db.rows(
            q + "WHERE r.buyer=? OR r.seller_wallet=? ORDER BY r.created_at DESC",
            account.id(),
            account.wallet());
  }

  @GetMapping("/views")
  Object views(@RequestAttribute Account account) {
    return db.rows(
        "SELECT property_id,result,viewed_at FROM verification_history WHERE account_id=? ORDER BY viewed_at DESC LIMIT 30",
        account.id());
  }

  @GetMapping("/my-history")
  Object personalHistory(@RequestAttribute Account account) {
    return db.rows(
        "SELECT * FROM chain_events WHERE previous_wallet=? OR new_wallet=? ORDER BY block_number DESC,log_index DESC",
        account.wallet(),
        account.wallet());
  }
}
