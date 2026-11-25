package in.landledger.registry;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
class ChainIndex {
  final RegistryRepository db;
  final ChainGateway chain;
  final PropertyService properties;
  final TransactionTemplate tx;
  private static final Logger log = LoggerFactory.getLogger(ChainIndex.class);
  private volatile boolean available;

  ChainIndex(
      RegistryRepository db,
      ChainGateway chain,
      PropertyService properties,
      TransactionTemplate tx) {
    this.db = db;
    this.chain = chain;
    this.properties = properties;
    this.tx = tx;
  }

  @Scheduled(fixedDelay = 10000, initialDelay = 3000)
  void poll() {
    try {
      sync();
      available = true;
    } catch (RuntimeException ex) {
      if (available) log.warn("Blockchain synchronization paused", ex);
      available = false;
    }
  }

  synchronized boolean sync() {
    var cursor = db.one("SELECT * FROM chain_cursor WHERE id=1");
    long from = ((Number) cursor.get("next_block")).longValue();
    var batch = chain.get("/events?from=" + from);
    String deployment = batch.get("deployment").asText();
    tx.executeWithoutResult(
        s -> {
          var locked = db.one("SELECT * FROM chain_cursor WHERE id=1 FOR UPDATE");
          if (locked.get("deployment") != null && !deployment.equals(locked.get("deployment")))
            throw Problems.bad("Database is bound to another contract. Select its deployment.");
          if (((Number) locked.get("next_block")).longValue() != from) return;
          if (from > batch.get("head").asLong() + 1)
            throw Problems.bad(
                "Chain height moved backwards. Restore the matching database and deployment.");
          for (var e : batch.get("events")) apply(e);
          db.update(
              "UPDATE chain_cursor SET deployment=?,next_block=? WHERE id=1",
              deployment,
              batch.get("next").asLong());
        });
    return batch.get("next").asLong() > batch.get("head").asLong();
  }

  private void apply(JsonNode e) {
    String id = e.get("id").asText(),
        kind = e.get("type").asText(),
        wallet = e.get("wallet").asText(),
        previous = e.get("previous").asText(),
        hash = e.get("hash").asText();
    long block = e.get("block").asLong();
    db.update(
        "INSERT INTO chain_events(tx_hash,log_index,property_id,kind,previous_wallet,new_wallet,block_number,recorded_at) VALUES(?,?,?,?,?,?,?,?)",
        hash,
        e.get("index").asInt(),
        id,
        kind,
        previous,
        wallet,
        block,
        e.get("time").asLong() * 1000);
    if (db.count("SELECT COUNT(*) FROM properties WHERE id=?", id) == 0) return;
    switch (kind) {
      case "Registered" -> {
        var p = properties.detail(id);
        boolean valid =
            "READY".equals(p.get("status"))
                && wallet.equals(p.get("initial_wallet"))
                && properties.digest(id).equals(e.get("digest").asText());
        db.update(
            "UPDATE properties SET status=?,owner_wallet=?,tx_hash=?,block_number=? WHERE id=?",
            valid ? "APPROVED" : "DISPUTED",
            wallet,
            hash,
            block,
            id);
      }
      case "TransferInitiated" ->
          db.update("UPDATE properties SET proposed_wallet=? WHERE id=?", wallet, id);
      case "TransferApproved" -> {
        db.update(
            "UPDATE properties SET owner_wallet=?,proposed_wallet=NULL,tx_hash=?,block_number=?,last_verification=NULL WHERE id=?",
            wallet,
            hash,
            block,
            id);
        db.update(
            "UPDATE purchase_requests SET status=CASE WHEN buyer=(SELECT id FROM accounts WHERE wallet=?) THEN 'COMPLETED' ELSE 'CLOSED' END WHERE property_id=? AND status='REQUESTED'",
            wallet,
            id);
      }
      case "TransferRejected" -> {
        db.update("UPDATE properties SET proposed_wallet=NULL WHERE id=?", id);
        db.update(
            "UPDATE purchase_requests SET status='REJECTED' WHERE property_id=? AND buyer=(SELECT id FROM accounts WHERE wallet=?) AND status='REQUESTED'",
            id,
            wallet);
      }
      default -> throw new IllegalArgumentException("Unknown contract event");
    }
  }
}
