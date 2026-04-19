<script>
  import { beforeNavigate, afterNavigate } from '$app/navigation';

  let active = $state(false);
  let complete = $state(false);

  beforeNavigate(() => {
    complete = false;
    active = true;
  });

  afterNavigate(() => {
    complete = true;
    setTimeout(() => {
      active = false;
      complete = false;
    }, 350);
  });
</script>

{#if active}
  <div class="progress-track" aria-hidden="true">
    <div class="progress-bar" class:complete></div>
  </div>
{/if}

<style>
  .progress-track {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    z-index: 9999;
    overflow: hidden;
  }

  .progress-bar {
    height: 100%;
    background: var(--color-fg);
    transform-origin: left center;
    animation: indeterminate 1.4s ease-in-out infinite;
    transition: none;
  }

  .progress-bar.complete {
    animation: none;
    transform: scaleX(1);
    transition: transform 0.2s ease-out, opacity 0.15s ease 0.2s;
    opacity: 0;
  }

  @keyframes indeterminate {
    0%   { transform: translateX(-100%) scaleX(0.4); }
    50%  { transform: translateX(30%)  scaleX(0.6); }
    100% { transform: translateX(110%) scaleX(0.4); }
  }
</style>
