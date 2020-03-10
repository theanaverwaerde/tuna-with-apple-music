/*************************************************************************
 * This file is part of tuna
 * github.con/univrsal/tuna
 * Copyright 2020 univrsal <universailp@web.de>.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 2 of the License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *************************************************************************/

#include "vlc_obs_source.hpp"
#ifndef DISABLE_TUNA_VLC
#include "../gui/tuna_gui.hpp"
#include "../util/config.hpp"
#include "../util/utility.hpp"
#include "../util/vlc_internal.h"

vlc_obs_source::vlc_obs_source() : music_source(S_SOURCE_VLC, T_SOURCE_VLC)
{
	m_capabilities = CAP_TITLE | CAP_ALBUM | CAP_PROGRESS | CAP_VOLUME_UP | CAP_VOLUME_DOWN | CAP_VOLUME_MUTE |
					 CAP_DURATION | CAP_PLAY_PAUSE | CAP_NEXT_SONG | CAP_PREV_SONG;

	if (!util::vlc_loaded)
		binfo("libVLC wasn't loaded, VLC support disabled");
}

vlc_obs_source::~vlc_obs_source()
{
	obs_weak_source_release(m_weak_src);
	m_weak_src = nullptr;
}

bool vlc_obs_source::reload()
{
	load();
	auto result = !!m_weak_src;
	if (m_weak_src) {
		auto src = obs_weak_source_get_source(m_weak_src);
		if (src) {
			result = obs_source_showing(src);
			obs_source_release(src);
		}
	}

	return result;
}

bool vlc_obs_source::enabled() const
{
	return util::vlc_loaded;
}

void vlc_obs_source::load()
{
	if (!util::vlc_loaded || m_weak_src)
		return;
	CDEF_STR(CFG_VLC_ID, "");
	m_target_source_name = CGET_STR(CFG_VLC_ID);

	auto *src = obs_get_source_by_name(m_target_source_name);

	obs_weak_source_release(m_weak_src);
	m_weak_src = nullptr;

	if (src) {
		const auto *id = obs_source_get_id(src);
		if (strcmp(id, "vlc_source") == 0) {
			m_weak_src = obs_source_get_weak_source(src);
		} else {
			binfo("%s (%s) is not a valid vlc source", m_target_source_name, id);
		}
		obs_source_release(src);
	}
}

void vlc_obs_source::save()
{
	if (!util::vlc_loaded)
		return;
	CSET_STR(CFG_VLC_ID, m_target_source_name);
}

struct vlc_source *vlc_obs_source::get_vlc()
{
	struct vlc_source *data = nullptr;
	obs_source_t *src = nullptr;
	if (!m_weak_src || !util::vlc_loaded)
		return data;

	src = obs_weak_source_get_source(m_weak_src);
	if (src) {
		void *private_data = obs_obj_get_data(src);
		if (private_data)
			data = reinterpret_cast<struct vlc_source *>(private_data);
	} else if (m_weak_src) { /* The actual source is gone -> clear the weak source */
		obs_weak_source_release(m_weak_src);
		m_weak_src = nullptr;
		load();
	}

	obs_source_release(src);
	return data;
}

void vlc_obs_source::refresh()
{

	if (!reload())
		return;

	auto *vlc = get_vlc();

	if (vlc) {
		/* Locking source mutex (vlc->mutex) here
         * seems to cause a crash
         **/
		m_current.clear();
		m_current.set_progress(libvlc_media_player_get_time_(vlc->media_player));
		m_current.set_duration(libvlc_media_player_get_length_(vlc->media_player));
		m_current.set_playing(libvlc_media_player_get_state_(vlc->media_player) == libvlc_Playing);

		auto *media = libvlc_media_player_get_media_(vlc->media_player);
		if (media) {
			const char *title = libvlc_media_get_meta_(media, libvlc_meta_Title);
			const char *artists = libvlc_media_get_meta_(media, libvlc_meta_Artist);
			const char *year = libvlc_media_get_meta_(media, libvlc_meta_Date);
			const char *album = libvlc_media_get_meta_(media, libvlc_meta_Album);
			const char *num = libvlc_media_get_meta_(media, libvlc_meta_TrackID);
			const char *disc = libvlc_media_get_meta_(media, libvlc_meta_DiscNumber);
			const char *cover = libvlc_media_get_meta_(media, libvlc_meta_ArtworkURL);

			if (title)
				m_current.set_title(title);
			if (cover)
				m_current.set_cover_link(cover);
			if (artists)
				m_current.append_artist(artists);
			if (year)
				m_current.set_year(year);
			if (album)
				m_current.set_album(album);
			if (num)
				m_current.set_track_number(std::stoi(num));

			if (disc)
				m_current.set_disc_number(std::stoi(disc));

			util::download_cover(m_current);
		}
	} else {
		m_current.clear();
	}
}

bool vlc_obs_source::execute_capability(capability c)
{
	/* vlc source already has hotkeys in obs */
	UNUSED_PARAMETER(c);
	return true;
}

void vlc_obs_source::set_gui_values()
{
	m_target_source_name = CGET_STR(CFG_VLC_ID);
	if (m_target_source_name)
		emit tuna_dialog->vlc_source_selected(utf8_to_qt(m_target_source_name));
}

bool vlc_obs_source::valid_format(const QString &str)
{
	UNUSED_PARAMETER(str);
	return true;
}
#else
vlc_obs_source::vlc_obs_source() : music_source(S_SOURCE_VLC, T_SOURCE_VLC) {}
vlc_obs_source::~vlc_obs_source() {}

void vlc_obs_source::load() {}
void vlc_obs_source::save() {}
void vlc_obs_source::refresh() {}
void vlc_obs_source::set_gui_values() {}
bool vlc_obs_source::execute_capability(capability c)
{
	return true;
}
bool vlc_obs_source::valid_format(const QString &str)
{
	return true;
}
struct vlc_source *vlc_obs_source::get_vlc()
{
	return nullptr;
}
bool vlc_obs_source::enabled() const
{
	return false;
}
#endif