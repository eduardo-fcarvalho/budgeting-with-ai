package com.eduardo.budgeting;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.security.Principal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
class Expenses {
    record Expense(@NotNull UUID id, @NotBlank @Size(max=240) String description,
                   @NotNull @Min(1) @Max(99999999999L) Long amount, @NotNull LocalDate date,
                   @NotBlank @Size(max=80) String category) {}
    private static final String SELECT = """
            select e.id, e.description, e.amount, e.date, c.name as category
            from expense e join category c on c.owner=e.owner and c.normalized=e.category_key
            where e.owner=:owner
            """;
    private final JdbcClient db;
    Expenses(JdbcClient db) { this.db = db; }

    @GetMapping("/expenses")
    List<Expense> history(Principal user) {
        return db.sql(SELECT + " order by e.date desc, e.id").param("owner", owner(user)).query(Expense.class).list();
    }

    @GetMapping("/categories")
    List<String> categories(Principal user) {
        return db.sql("select name from category where owner=? order by normalized")
                .param(owner(user)).query(String.class).list();
    }

    @PostMapping("/expenses")
    @Transactional
    @ResponseStatus(HttpStatus.CREATED)
    Expense create(Principal user, @RequestBody @Valid Expense input) {
        var owner = owner(user);
        ensureCategory(owner, input.category());
        int inserted = db.sql("""
                insert into expense(owner,id,description,amount,date,category_key)
                values(?,?,?,?,?,lower(trim(?))) on conflict (owner,id) do nothing
                """).params(owner, input.id(), input.description().strip(), input.amount(), input.date(), input.category().strip()).update();
        var saved = find(owner, input.id());
        if (inserted == 0 && !(saved.description().equals(input.description().strip()) &&
                saved.amount().equals(input.amount()) && saved.date().equals(input.date()) &&
                saved.category().equalsIgnoreCase(input.category().strip()))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT);
        }
        return saved;
    }

    @PutMapping("/expenses/{id}")
    @Transactional
    Expense edit(Principal user, @PathVariable UUID id, @RequestBody @Valid Expense input) {
        if (!id.equals(input.id())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        var owner = owner(user);
        ensureCategory(owner, input.category());
        db.sql("update expense set description=?,amount=?,date=?,category_key=lower(trim(?)) where owner=? and id=?")
                .params(input.description().strip(), input.amount(), input.date(), input.category().strip(), owner, id).update();
        return find(owner, id);
    }

    @DeleteMapping("/expenses/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(Principal user, @PathVariable UUID id) {
        if (db.sql("delete from expense where owner=? and id=?").params(owner(user), id).update() == 0)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
    }

    private Expense find(UUID owner, UUID id) {
        return db.sql(SELECT + " and e.id=:id").param("owner", owner).param("id", id)
                .query(Expense.class).optional().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
    private void ensureCategory(UUID owner, String name) {
        db.sql("insert into category(owner,name) values(?,?) on conflict (owner,normalized) do nothing")
                .params(owner, name.strip()).update();
    }
    static UUID owner(Principal user) { return UUID.fromString(user.getName()); }
}
