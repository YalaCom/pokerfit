INSERT OR IGNORE INTO jackpot_pools(id,balance,base_balance) VALUES('grand',0,0);
UPDATE jackpot_pools SET balance=0,base_balance=0,updated_at=CURRENT_TIMESTAMP WHERE id='grand';
