defmodule Thirstr.Valkey do
  @moduledoc """
  RAM-only store (ADR-0001): challenges, magic links, rate limits, device flags.
  Valkey runs with persistence disabled, so nothing here survives a restart by design.
  """
  @name __MODULE__

  def child_spec(_opts) do
    url = Application.fetch_env!(:thirstr, :valkey_url)
    # Fly 6PN is IPv6-only.
    socket_opts = if System.get_env("ECTO_IPV6") in ~w(true 1), do: [:inet6], else: []
    opts = [name: @name, sync_connect: false, socket_opts: socket_opts]
    %{id: @name, start: {Redix, :start_link, [url, opts]}}
  end

  def command!(cmd), do: Redix.command!(@name, cmd)
  def command(cmd), do: Redix.command(@name, cmd)

  @doc "Store an Elixir term with a TTL in seconds."
  def put_term(key, term, ttl_s) do
    command!(["SET", key, :erlang.term_to_binary(term), "EX", Integer.to_string(ttl_s)])
    :ok
  end

  @doc "Atomically read and delete (single-use secrets)."
  # Input is server-written (own DB / RAM store), decoded with :safe.
  # sobelow_skip ["Misc.BinToTerm"]
  def take_term(key) do
    case command!(["GETDEL", key]) do
      nil -> nil
      bin -> :erlang.binary_to_term(bin, [:safe])
    end
  end

  def exists?(key), do: command!(["EXISTS", key]) == 1

  @doc "Fixed-window counter. Returns {:ok, count} or {:error, :rate_limited, retry_after}."
  def hit(key, limit, window_s) do
    [count, ttl] =
      Redix.pipeline!(@name, [
        ["INCR", key],
        ["TTL", key]
      ])

    if ttl < 0, do: command!(["EXPIRE", key, Integer.to_string(window_s)])

    if count > limit,
      do: {:error, :rate_limited, max(ttl, 1)},
      else: {:ok, count}
  end
end
