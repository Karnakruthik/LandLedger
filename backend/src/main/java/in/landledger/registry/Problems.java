package in.landledger.registry;

import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
class Problems {
  static ResponseStatusException bad(String message) {
    return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
  }

  static ResponseStatusException unauthorized() {
    return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Please sign in again.");
  }

  static ResponseStatusException denied() {
    return new ResponseStatusException(
        HttpStatus.FORBIDDEN, "Your account cannot perform this action.");
  }

  static ResponseStatusException missing() {
    return new ResponseStatusException(HttpStatus.NOT_FOUND, "Property not found.");
  }

  static ResponseStatusException offline() {
    return new ResponseStatusException(
        HttpStatus.SERVICE_UNAVAILABLE,
        "Blockchain connection unavailable. Check the RPC, bridge and contract deployment.");
  }

  @ExceptionHandler(ResponseStatusException.class)
  ResponseEntity<?> status(ResponseStatusException e) {
    return ResponseEntity.status(e.getStatusCode()).body(Map.of("message", e.getReason()));
  }

  @ExceptionHandler(DataIntegrityViolationException.class)
  ResponseEntity<?> duplicate() {
    return ResponseEntity.status(409)
        .body(
            Map.of("message", "An account, parcel or request with those details already exists."));
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<?> invalid(MethodArgumentNotValidException e) {
    var f = e.getBindingResult().getFieldErrors().get(0);
    return ResponseEntity.badRequest()
        .body(Map.of("message", f.getField() + " " + f.getDefaultMessage()));
  }

  @ExceptionHandler(MaxUploadSizeExceededException.class)
  ResponseEntity<?> tooLarge() {
    return ResponseEntity.status(413).body(Map.of("message", "Upload a PDF up to 5 MB."));
  }
}
