<?php

declare(strict_types=1);

/**
 * SPDX-FileCopyrightText: 2026 ppardi <6176270+ppardi@users.noreply.github.com>
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Tasks\Listeners;

use OCA\DAV\Events\SabrePluginAddEvent;
use OCA\Tasks\Dav\ParseOnArrivalPlugin;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use Psr\Container\ContainerInterface;

/**
 * Adds the plugin that fills in new tasks from their title to the dav app's
 * server. SabrePluginAddEvent is the dav app's, not OCP: re-check it on every
 * Nextcloud major.
 *
 * @template-implements IEventListener<SabrePluginAddEvent>
 */
class SabrePluginAddListener implements IEventListener {
	public function __construct(
		private ContainerInterface $container,
	) {
	}

	public function handle(Event $event): void {
		if (!($event instanceof SabrePluginAddEvent)) {
			return;
		}
		$event->getServer()->addPlugin($this->container->get(ParseOnArrivalPlugin::class));
	}
}
