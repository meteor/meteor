use std::io::{self, Read};

use anyhow::{Context, Result};
use meteor_source_map_helper::{Request, execute};

fn main() {
    if let Err(error) = run() {
        let response = serde_json::json!({
            "protocolVersion": 1,
            "success": false,
            "error": format!("{error:#}"),
        });

        println!("{response}");
        std::process::exit(1);
    }
}

fn run() -> Result<()> {
    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .context("reading helper request")?;

    let request: Request = serde_json::from_str(&input).context("parsing helper request")?;
    let response = execute(request)?;

    println!("{}", serde_json::to_string(&response)?);
    Ok(())
}
