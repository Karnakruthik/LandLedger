package in.landledger.registry;

import jakarta.validation.constraints.*;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

record LandApplication(
    @NotBlank @Size(max = 100) String ownerName,
    @NotBlank @Size(max = 80) String identityRef,
    @NotBlank @Size(max = 150) String location,
    @NotBlank @Size(max = 80) String state,
    @NotBlank @Size(max = 80) String district,
    @NotBlank @Size(max = 80) String survey,
    @NotNull @DecimalMin("0.01") @Digits(integer = 12, fraction = 2) BigDecimal area,
    @NotNull @Pattern(regexp = "Agricultural|Residential|Commercial|Industrial")
        String propertyType,
    @NotBlank @Size(max = 300) String address) {}

@Service
class PropertyService {
  static final String FIELDS =
      "id,owner_name,initial_wallet,owner_wallet,location,state,district,survey,area,property_type,address,created_at,status,review_note,proposed_wallet,tx_hash,block_number";
  final RegistryRepository db;

  PropertyService(RegistryRepository db) {
    this.db = db;
  }

  String submit(Account a, LandApplication f, MultipartFile document) throws IOException {
    if (!"LANDOWNER".equals(a.role())) throw Problems.denied();
    a.requireWallet();
    byte[] file = document.getBytes();
    if (file.length < 12
        || file.length > 5242880
        || !new String(file, 0, 5, StandardCharsets.US_ASCII).equals("%PDF-")
        || !new String(
                file,
                Math.max(0, file.length - 1024),
                Math.min(file.length, 1024),
                StandardCharsets.ISO_8859_1)
            .contains("%%EOF")) throw Problems.bad("Attach a valid PDF document up to 5 MB.");
    String id =
        "LAND-"
            + UUID.randomUUID()
                .toString()
                .replace("-", "")
                .substring(0, 16)
                .toUpperCase(Locale.ROOT);
    db.update(
        "INSERT INTO properties (id,applicant,owner_name,identity_ref,initial_wallet,owner_wallet,location,state,district,survey,area,property_type,address,created_at,document,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'PENDING')",
        id,
        a.id(),
        f.ownerName().trim(),
        f.identityRef().trim(),
        a.wallet(),
        a.wallet(),
        f.location().trim(),
        f.state().trim(),
        f.district().trim(),
        f.survey().trim(),
        f.area().stripTrailingZeros().toPlainString(),
        f.propertyType(),
        f.address().trim(),
        System.currentTimeMillis(),
        file);
    return id;
  }

  Map<String, Object> detail(String id) {
    var p = db.one("SELECT " + FIELDS + ",applicant FROM properties WHERE id=?", id);
    if (p.isEmpty()) throw Problems.missing();
    return p;
  }

  boolean entitled(Account a, Map<String, Object> p) {
    return a.admin()
        || a.id().equals(p.get("applicant"))
        || (a.wallet() != null && a.wallet().equals(p.get("owner_wallet")));
  }

  byte[] document(String id) {
    return db.document(id);
  }

  String digest(String id) {
    var p = db.one("SELECT " + FIELDS + ",identity_ref FROM properties WHERE id=?", id);
    try {
      MessageDigest sha = MessageDigest.getInstance("SHA-256");
      for (String field :
          List.of(
              "id",
              "owner_name",
              "identity_ref",
              "initial_wallet",
              "location",
              "state",
              "district",
              "survey",
              "area",
              "property_type",
              "address",
              "created_at")) {
        byte[] value = p.get(field).toString().getBytes(StandardCharsets.UTF_8);
        sha.update(ByteBuffer.allocate(4).putInt(value.length).array());
        sha.update(value);
      }
      sha.update(MessageDigest.getInstance("SHA-256").digest(document(id)));
      return HexFormat.of().formatHex(sha.digest());
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
}
