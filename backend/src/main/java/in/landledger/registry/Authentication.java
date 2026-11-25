package in.landledger.registry;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.Instant;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.*;

@Component
class Tokens {
  private final byte[] key;
  private final ObjectMapper json;
  private static final Base64.Encoder B64 = Base64.getUrlEncoder().withoutPadding();
  private static final String HEADER =
      B64.encodeToString("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));

  Tokens(@Value("${registry.jwt-secret}") String secret, ObjectMapper json) {
    this.key = secret.getBytes(StandardCharsets.UTF_8);
    this.json = json;
    if (key.length < 32)
      throw new IllegalArgumentException("JWT_SECRET must contain at least 32 bytes");
  }

  private byte[] mac(String input) throws GeneralSecurityException {
    var mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(key, "HmacSHA256"));
    return mac.doFinal(input.getBytes(StandardCharsets.US_ASCII));
  }

  String issue(String id) {
    try {
      String data =
          HEADER
              + "."
              + B64.encodeToString(
                  json.writeValueAsBytes(
                      Map.of("sub", id, "exp", Instant.now().getEpochSecond() + 28800)));
      return data + "." + B64.encodeToString(mac(data));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  String subject(String token) {
    try {
      String[] p = token.split("\\.");
      if (p.length != 3
          || !HEADER.equals(p[0])
          || !MessageDigest.isEqual(mac(p[0] + "." + p[1]), Base64.getUrlDecoder().decode(p[2])))
        throw Problems.unauthorized();
      var data = json.readTree(Base64.getUrlDecoder().decode(p[1]));
      if (data.path("exp").asLong() <= Instant.now().getEpochSecond())
        throw Problems.unauthorized();
      return data.path("sub").asText();
    } catch (Exception e) {
      throw Problems.unauthorized();
    }
  }
}

@Configuration
class AuthConfig implements WebMvcConfigurer {
  final Tokens tokens;
  final RegistryRepository db;

  AuthConfig(Tokens tokens, RegistryRepository db) {
    this.tokens = tokens;
    this.db = db;
  }

  public void addInterceptors(InterceptorRegistry registry) {
    registry
        .addInterceptor(
            new HandlerInterceptor() {
              public boolean preHandle(
                  HttpServletRequest req, HttpServletResponse res, Object handler) {
                res.setHeader("Cache-Control", "no-store");
                res.setHeader("X-Content-Type-Options", "nosniff");
                String path = req.getRequestURI(), auth = req.getHeader("Authorization");
                if (auth != null && auth.startsWith("Bearer "))
                  req.setAttribute("account", db.account(tokens.subject(auth.substring(7))));
                boolean open =
                    path.equals("/api/auth/login")
                        || path.equals("/api/auth/signup")
                        || (req.getMethod().equals("GET") && path.startsWith("/api/public/"));
                if (!open && req.getAttribute("account") == null) throw Problems.unauthorized();
                return true;
              }
            })
        .addPathPatterns("/api/**");
  }

  @Bean
  BCryptPasswordEncoder encoder() {
    return new BCryptPasswordEncoder(12);
  }

  @Bean
  ApplicationRunner administrator(
      @Value("${registry.admin-email}") String email,
      @Value("${registry.admin-password}") String password,
      BCryptPasswordEncoder bcrypt) {
    return args -> {
      if (!email.isBlank()
          && db.count(
                  "SELECT COUNT(*) FROM accounts WHERE email=?",
                  email.trim().toLowerCase(Locale.ROOT))
              == 0) {
        if (password.length() < 12 || password.getBytes(StandardCharsets.UTF_8).length > 72)
          throw new IllegalArgumentException("Admin password must be 12–72 bytes");
        db.update(
            "INSERT INTO accounts(id,name,email,role,pass_hash) VALUES(?,?,?,?,?)",
            UUID.randomUUID().toString(),
            "Registry Administrator",
            email.trim().toLowerCase(Locale.ROOT),
            "ADMIN",
            bcrypt.encode(password));
      }
    };
  }
}

record Signup(
    @NotBlank @Size(max = 100) String name,
    @Email @NotBlank @Size(max = 254) String email,
    @Size(min = 10, max = 72) @NotNull String password,
    @Pattern(regexp = "LANDOWNER|BUYER") @NotNull String role) {}

record Login(@NotBlank String email, @NotBlank @Size(max = 72) String password) {}

record Signature(@NotBlank @Size(max = 180) String signature) {}

@RestController
@RequestMapping("/api")
class Authentication {
  final RegistryRepository db;
  final Tokens tokens;
  final BCryptPasswordEncoder bcrypt;
  final ChainGateway chain;

  Authentication(
      RegistryRepository db, Tokens tokens, BCryptPasswordEncoder bcrypt, ChainGateway chain) {
    this.db = db;
    this.tokens = tokens;
    this.bcrypt = bcrypt;
    this.chain = chain;
  }

  @PostMapping("/auth/signup")
  Object signup(@Valid @RequestBody Signup s) {
    if (s.password().getBytes(StandardCharsets.UTF_8).length > 72)
      throw Problems.bad("Password must be at most 72 bytes.");
    String id = UUID.randomUUID().toString();
    db.update(
        "INSERT INTO accounts(id,name,email,pass_hash,role) VALUES(?,?,?,?,?)",
        id,
        s.name().trim(),
        s.email().trim().toLowerCase(Locale.ROOT),
        bcrypt.encode(s.password()),
        s.role());
    return Map.of("token", tokens.issue(id), "account", db.account(id));
  }

  @PostMapping("/auth/login")
  Object login(@Valid @RequestBody Login s) {
    var row =
        db.one(
            "SELECT id,pass_hash FROM accounts WHERE email=?",
            s.email().trim().toLowerCase(Locale.ROOT));
    if (row.isEmpty() || !bcrypt.matches(s.password(), (String) row.get("pass_hash")))
      throw new org.springframework.web.server.ResponseStatusException(
          org.springframework.http.HttpStatus.UNAUTHORIZED, "Incorrect email or password.");
    String id = (String) row.get("id");
    return Map.of("token", tokens.issue(id), "account", db.account(id));
  }

  @GetMapping("/me")
  Account me(@RequestAttribute Account account) {
    return account;
  }

  @PostMapping("/wallet/challenge")
  Object challenge(@RequestAttribute Account account) {
    if (account.wallet() != null) throw Problems.bad("This account already has a linked wallet.");
    String message =
        "LandLedger account wallet authorization\nAccount "
            + account.id()
            + "\nNonce "
            + UUID.randomUUID()
            + "\nValid for five minutes";
    db.update(
        "UPDATE accounts SET challenge=?,challenge_until=? WHERE id=?",
        message,
        System.currentTimeMillis() + 300000,
        account.id());
    return Map.of("message", message);
  }

  @Transactional
  @PostMapping("/wallet/link")
  Object link(@RequestAttribute Account account, @Valid @RequestBody Signature signature) {
    var row =
        db.one(
            "SELECT challenge,challenge_until,wallet FROM accounts WHERE id=? FOR UPDATE",
            account.id());
    if (row.get("wallet") != null
        || row.get("challenge") == null
        || ((Number) row.get("challenge_until")).longValue() < System.currentTimeMillis())
      throw Problems.bad("Request a fresh wallet challenge.");
    String wallet = chain.recover((String) row.get("challenge"), signature.signature());
    if (account.admin()
        && !wallet.equalsIgnoreCase(chain.get("/config").path("administrator").asText()))
      throw Problems.bad("Select the contract administrator wallet in MetaMask.");
    db.update(
        "UPDATE accounts SET wallet=?,challenge=NULL,challenge_until=NULL WHERE id=?",
        wallet,
        account.id());
    return db.account(account.id());
  }
}
