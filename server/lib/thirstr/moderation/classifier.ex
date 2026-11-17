defmodule Thirstr.Moderation.Classifier do
  @moduledoc """
  Public-photo classifier contract (F-15 R-15.10). Beta target: self-hosted model
  on a GPU node (ADR-0001). Result for the main slot must be `:ok_main`.
  """
  @type verdict :: {:ok_main | :ok_public, map()} | {:rejected, :too_explicit | :no_person, map()}
  @callback classify(storage_key :: String.t(), slot :: non_neg_integer()) :: verdict

  def impl, do: Application.fetch_env!(:thirstr, :photo_classifier)
end

defmodule Thirstr.Moderation.DevClassifier do
  @moduledoc """
  DEV/test stand-in until the real model ships (tracked in GitHub). Accepts any
  uploaded image; an object whose key ends in `-explicit` or `-noperson` is rejected
  so the S-05 rejection states can be exercised.
  """
  @behaviour Thirstr.Moderation.Classifier

  @impl true
  def classify(key, slot) do
    cond do
      String.ends_with?(key, "-explicit") and slot == 0 ->
        {:rejected, :too_explicit, %{"explicit" => 0.9}}

      String.ends_with?(key, "-noperson") ->
        {:rejected, :no_person, %{"person" => 0.05}}

      slot == 0 ->
        {:ok_main, %{"explicit" => 0.01, "person" => 0.99}}

      true ->
        {:ok_public, %{"explicit" => 0.3, "person" => 0.99}}
    end
  end
end
